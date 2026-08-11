// Requête bbox du RPG Roumanie.
//
// Le jeu de données initial (un seul gpkg ~2,3 Go) a été redécoupé en plusieurs
// GeoPackage régionaux (un par région de développement), plus simples à pousser
// sur GitHub via LFS (chacun < 2 Go). Ce module interroge l'ensemble du dossier.
//
// Chaque fichier est ouvert sur disque via node:sqlite (DatabaseSync) — pas via
// sql.js qui chargerait tout en mémoire — et s'appuie sur l'index rtree du
// GeoPackage. On ne lit que les fichiers dont l'emprise intersecte la bbox
// demandée (en général un seul au zoom ≥ 12), et on s'arrête dès qu'on a réuni
// maxFeatures parcelles, tous fichiers confondus.
//
// SRS : les fichiers régionaux sont en Stereo 70 roumain (EPSG:3844), déclaré
// sous un srs_id local 100000. On reprojette en WGS84 avec le décalage de datum
// officiel (towgs84) pour rester aligné à l'imagerie satellite.

import path from "node:path";
import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import proj4 from "proj4";

import {
  parseGeoPackageGeometry,
  transformGeometryCoordinates,
  envelopeIntersectsDatasetBbox,
  geometryIntersectsWgs84Bbox,
} from "./geopackage-query.mjs";

// Stereo 70 roumain (EPSG:3844) avec décalage de datum Krassowsky→WGS84.
proj4.defs(
  "EPSG:3844",
  "+proj=sterea +lat_0=46 +lon_0=25 +k=0.99975 +x_0=500000 +y_0=500000 +ellps=krass +towgs84=2.329,-147.042,-92.08,-0.309,0.325,0.497,5.69 +units=m +no_defs +type=crs"
);

const dbCache = new Map();
let fileListCache = null;
let fileListDir = null;

function qIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** Construit les projecteurs dataset↔WGS84 selon le SRS du fichier. */
function buildProjection(srs, definition) {
  if (srs === 4326) {
    const identity = (coords) => coords;
    return { toWgs84: identity, fromWgs84: identity };
  }
  // Les fichiers régionaux sont en Stereo 70 (EPSG:3844). On privilégie la
  // définition canonique avec towgs84 ; sinon on retombe sur le WKT du fichier.
  const looksStereo70 =
    typeof definition === "string" &&
    /Oblique_Stereographic|Stereo\s*70/i.test(definition);
  const source = looksStereo70 ? "EPSG:3844" : definition || "EPSG:3844";
  return {
    toWgs84: (coords) => proj4(source, "EPSG:4326", coords),
    fromWgs84: (coords) => proj4("EPSG:4326", source, coords),
  };
}

/** Projette une bbox WGS84 vers le SRS du dataset (AABB des 4 coins). */
function projectBboxToDataset(bbox, projection) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const corners = [
    projection.fromWgs84([minLng, minLat]),
    projection.fromWgs84([minLng, maxLat]),
    projection.fromWgs84([maxLng, minLat]),
    projection.fromWgs84([maxLng, maxLat]),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function openDatabase(filePath) {
  const normalizedPath = path.resolve(filePath);
  const cached = dbCache.get(normalizedPath);
  if (cached) return cached;

  const db = new DatabaseSync(normalizedPath, { readOnly: true });

  const meta = db
    .prepare("SELECT table_name, column_name, srs_id FROM gpkg_geometry_columns LIMIT 1")
    .get();
  if (!meta) {
    db.close();
    throw new Error(`GeoPackage has no geometry columns: ${normalizedPath}`);
  }
  const table = String(meta.table_name);
  const column = String(meta.column_name);
  const srs = meta.srs_id == null ? null : Number(meta.srs_id);

  const def =
    srs == null || srs === 4326
      ? null
      : db
          .prepare("SELECT definition FROM gpkg_spatial_ref_sys WHERE srs_id = ?")
          .get(srs)?.definition ?? null;
  const projection = buildProjection(srs, def);

  const contents = db
    .prepare(
      `SELECT min_x, min_y, max_x, max_y FROM gpkg_contents WHERE table_name = ? LIMIT 1`
    )
    .get(table);
  const datasetBounds =
    contents && [contents.min_x, contents.min_y, contents.max_x, contents.max_y].every(
      (v) => Number.isFinite(Number(v))
    )
      ? [Number(contents.min_x), Number(contents.min_y), Number(contents.max_x), Number(contents.max_y)]
      : null;

  let pkColumn = null;
  for (const row of db.prepare(`PRAGMA table_info(${qIdent(table)})`).all()) {
    if (Number(row.pk) === 1) {
      pkColumn = String(row.name);
      break;
    }
  }
  if (!pkColumn) {
    db.close();
    throw new Error(`No primary key found in ${table}`);
  }

  const rtreeTable = `rtree_${table}_${column}`;
  const rtreeExists =
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(rtreeTable) != null;

  const descriptor = {
    db,
    filePath: normalizedPath,
    table,
    column,
    srs,
    projection,
    datasetBounds,
    pkColumn,
    rtreeTable: rtreeExists ? rtreeTable : null,
  };

  dbCache.set(normalizedPath, descriptor);
  return descriptor;
}

function aabbIntersects(a, b) {
  if (!a || !b) return true; // bornes inconnues : ne pas exclure
  return a[2] >= b[0] && a[0] <= b[2] && a[3] >= b[1] && a[1] <= b[3];
}

/** Interroge un fichier et pousse les features dans `out` (jusqu'à `limit` total). */
function queryFileInto(descriptor, bbox, limit, out) {
  const datasetBbox = projectBboxToDataset(bbox, descriptor.projection);

  // Filtre grossier : si l'emprise du fichier ne croise pas la bbox, on saute.
  if (!aabbIntersects(descriptor.datasetBounds, datasetBbox)) return;

  const [minX, minY, maxX, maxY] = datasetBbox;
  const table = qIdent(descriptor.table);
  const geomColumn = qIdent(descriptor.column);
  const pkColumn = qIdent(descriptor.pkColumn);

  const parseRowToFeature = (row) => {
    const props = {};
    let geometryBlob = null;
    let id;

    for (const [key, value] of Object.entries(row)) {
      if (key === descriptor.column) {
        if (value instanceof Uint8Array) geometryBlob = value;
      } else {
        props[key] = value;
        if (key === descriptor.pkColumn) id = value;
      }
    }

    if (!geometryBlob) return null;
    if (!envelopeIntersectsDatasetBbox(geometryBlob, datasetBbox)) return null;

    const geometry = parseGeoPackageGeometry(geometryBlob);
    if (!geometry) return null;

    const transformed = transformGeometryCoordinates(geometry, descriptor.projection.toWgs84);
    if (!geometryIntersectsWgs84Bbox(transformed, bbox)) return null;

    return { type: "Feature", id, geometry: transformed, properties: props };
  };

  // Pas de LIMIT SQL : la bbox rtree (en SRS dataset) sur-approxime l'emprise
  // WGS84 réelle ; tronquer avant le filtrage géométrique pourrait renvoyer trop
  // peu (voire 0) de parcelles. On itère et on s'arrête au quota global.
  if (descriptor.rtreeTable) {
    const stmt = descriptor.db.prepare(
      `SELECT t.* FROM ${table} t` +
        ` JOIN ${qIdent(descriptor.rtreeTable)} r ON t.${pkColumn} = r.id` +
        " WHERE r.maxx >= ? AND r.minx <= ? AND r.maxy >= ? AND r.miny <= ?"
    );
    for (const row of stmt.iterate(minX, maxX, minY, maxY)) {
      const feature = parseRowToFeature(row);
      if (!feature) continue;
      out.push(feature);
      if (out.length >= limit) return;
    }
  } else {
    const stmt = descriptor.db.prepare(
      `SELECT t.* FROM ${table} t WHERE t.${geomColumn} IS NOT NULL`
    );
    for (const row of stmt.iterate()) {
      const feature = parseRowToFeature(row);
      if (!feature) continue;
      out.push(feature);
      if (out.length >= limit) return;
    }
  }
}

function listGpkgFiles(dirPath) {
  const normalizedDir = path.resolve(dirPath);
  if (fileListCache && fileListDir === normalizedDir) return fileListCache;
  const files = readdirSync(normalizedDir)
    .filter((name) => name.toLowerCase().endsWith(".gpkg"))
    .map((name) => path.join(normalizedDir, name));
  fileListCache = files;
  fileListDir = normalizedDir;
  return files;
}

/**
 * Interroge le dossier de GeoPackage régionaux du RPG Roumanie.
 * @param {object} opts
 * @param {string} opts.dirPath  Dossier contenant les .gpkg régionaux.
 * @param {number[]} opts.bbox   [minLon, minLat, maxLon, maxLat] (WGS84).
 * @param {number} [opts.maxFeatures=1000] Quota global de parcelles.
 */
export function queryRpgRomaniaByBbox({ dirPath, bbox, maxFeatures = 1000 }) {
  const features = [];
  for (const filePath of listGpkgFiles(dirPath)) {
    if (features.length >= maxFeatures) break;
    const descriptor = openDatabase(filePath);
    queryFileInto(descriptor, bbox, maxFeatures, features);
  }
  return { type: "FeatureCollection", features };
}

export function closeRpgRomaniaCache() {
  for (const entry of dbCache.values()) entry.db.close();
  dbCache.clear();
  fileListCache = null;
  fileListDir = null;
}
