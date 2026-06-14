import path from "node:path";
import { readFile } from "node:fs/promises";

import initSqlJs from "sql.js/dist/sql-wasm.js";
import proj4 from "proj4";

proj4.defs(
  "EPSG:2154",
  "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
);

const MAX_OPEN_DATABASES = 10;

let sqlModulePromise = null;
const dbCache = new Map();

function qIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toWgs84([x, y]) {
  return proj4("EPSG:2154", "EPSG:4326", [x, y]);
}

function toLambert93([lon, lat]) {
  return proj4("EPSG:4326", "EPSG:2154", [lon, lat]);
}

async function getSqlModule() {
  if (!sqlModulePromise) {
    const wasmPath = path.resolve(
      process.cwd(),
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm.wasm"
    );
    sqlModulePromise = initSqlJs({
      locateFile: () => wasmPath,
    });
  }
  return sqlModulePromise;
}

function geometryEnvelopeSize(flags) {
  const envelopeIndicator = (flags >> 1) & 0x7;
  switch (envelopeIndicator) {
    case 0:
      return 0;
    case 1:
      return 32;
    case 2:
    case 3:
      return 48;
    case 4:
      return 64;
    default:
      throw new Error(`Unsupported envelope indicator: ${envelopeIndicator}`);
  }
}

function parseWkbGeometry(view, startOffset) {
  let offset = startOffset;
  if (offset >= view.byteLength) {
    return { geometry: null, offset };
  }

  const byteOrder = view.getUint8(offset);
  offset += 1;
  const littleEndian = byteOrder === 1;
  let rawType = view.getUint32(offset, littleEndian);
  offset += 4;

  let hasZ = false;
  let hasM = false;
  let geometryType = rawType;

  if (rawType >= 3000 && rawType < 4000) {
    hasZ = true;
    hasM = true;
    geometryType = rawType - 3000;
  } else if (rawType >= 2000 && rawType < 3000) {
    hasM = true;
    geometryType = rawType - 2000;
  } else if (rawType >= 1000 && rawType < 2000) {
    hasZ = true;
    geometryType = rawType - 1000;
  }

  if ((rawType & 0x80000000) !== 0) hasZ = true;
  if ((rawType & 0x40000000) !== 0) hasM = true;
  if ((rawType & 0x20000000) !== 0) {
    offset += 4;
  }

  geometryType &= 0x000000ff;
  const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);

  const readPoint = () => {
    const x = view.getFloat64(offset, littleEndian);
    const y = view.getFloat64(offset + 8, littleEndian);
    offset += dims > 2 ? 8 * dims : 16;
    return [x, y];
  };

  const readPointArray = (count) => {
    const coords = [];
    for (let i = 0; i < count; i += 1) {
      coords.push(readPoint());
    }
    return coords;
  };

  const readLineString = () => {
    const numPoints = view.getUint32(offset, littleEndian);
    offset += 4;
    return { type: "LineString", coordinates: readPointArray(numPoints) };
  };

  const readLinearRing = () => {
    const numPoints = view.getUint32(offset, littleEndian);
    offset += 4;
    return readPointArray(numPoints);
  };

  const readPolygon = () => {
    const numRings = view.getUint32(offset, littleEndian);
    offset += 4;
    const rings = [];
    for (let i = 0; i < numRings; i += 1) {
      rings.push(readLinearRing());
    }
    return { type: "Polygon", coordinates: rings };
  };

  switch (geometryType) {
    case 1: {
      const [x, y] = readPoint();
      return { geometry: { type: "Point", coordinates: [x, y] }, offset };
    }
    case 2: {
      return { geometry: readLineString(), offset };
    }
    case 3: {
      return { geometry: readPolygon(), offset };
    }
    case 4: {
      const numPoints = view.getUint32(offset, littleEndian);
      offset += 4;
      return {
        geometry: { type: "MultiPoint", coordinates: readPointArray(numPoints) },
        offset,
      };
    }
    case 5: {
      const numLines = view.getUint32(offset, littleEndian);
      offset += 4;
      const lines = [];
      for (let i = 0; i < numLines; i += 1) {
        const parsed = parseWkbGeometry(view, offset);
        if (!parsed.geometry || parsed.geometry.type !== "LineString") {
          throw new Error("Unexpected geometry in MultiLineString");
        }
        offset = parsed.offset;
        lines.push(parsed.geometry.coordinates);
      }
      return {
        geometry: { type: "MultiLineString", coordinates: lines },
        offset,
      };
    }
    case 6: {
      const numPolygons = view.getUint32(offset, littleEndian);
      offset += 4;
      const polygons = [];
      for (let i = 0; i < numPolygons; i += 1) {
        const parsed = parseWkbGeometry(view, offset);
        if (!parsed.geometry || parsed.geometry.type !== "Polygon") {
          throw new Error("Unexpected geometry in MultiPolygon");
        }
        offset = parsed.offset;
        polygons.push(parsed.geometry.coordinates);
      }
      return {
        geometry: { type: "MultiPolygon", coordinates: polygons },
        offset,
      };
    }
    case 7: {
      const num = view.getUint32(offset, littleEndian);
      offset += 4;
      const geoms = [];
      for (let i = 0; i < num; i += 1) {
        const parsed = parseWkbGeometry(view, offset);
        offset = parsed.offset;
        if (parsed.geometry) geoms.push(parsed.geometry);
      }
      return {
        geometry: { type: "GeometryCollection", geometries: geoms },
        offset,
      };
    }
    default:
      throw new Error(`Unsupported WKB geometry type: ${geometryType}`);
  }
}

export function parseGeoPackageGeometry(bytes) {
  if (!bytes || bytes.length < 8) return null;
  if (bytes[0] !== 0x47 || bytes[1] !== 0x50) {
    throw new Error("Invalid GeoPackage geometry header");
  }
  const flags = bytes[3];
  const isEmpty = (flags & 0x10) !== 0;
  if (isEmpty) return null;
  const envelopeSize = geometryEnvelopeSize(flags);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = 8 + envelopeSize;
  return parseWkbGeometry(view, offset).geometry;
}

function transformPosition(position, project) {
  if (!Array.isArray(position) || position.length < 2) return position;
  const [x, y, ...rest] = position;
  const [lng, lat] = project([Number(x), Number(y)]);
  return [lng, lat, ...rest];
}

export function transformGeometryCoordinates(geometry, project) {
  switch (geometry.type) {
    case "Point":
      return {
        type: "Point",
        coordinates: transformPosition(geometry.coordinates, project),
      };
    case "MultiPoint":
      return {
        type: "MultiPoint",
        coordinates: geometry.coordinates.map((position) => transformPosition(position, project)),
      };
    case "LineString":
      return {
        type: "LineString",
        coordinates: geometry.coordinates.map((position) => transformPosition(position, project)),
      };
    case "MultiLineString":
      return {
        type: "MultiLineString",
        coordinates: geometry.coordinates.map((line) =>
          line.map((position) => transformPosition(position, project))
        ),
      };
    case "Polygon":
      return {
        type: "Polygon",
        coordinates: geometry.coordinates.map((ring) =>
          ring.map((position) => transformPosition(position, project))
        ),
      };
    case "MultiPolygon":
      return {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((ring) => ring.map((position) => transformPosition(position, project)))
        ),
      };
    case "GeometryCollection":
      return {
        type: "GeometryCollection",
        geometries: geometry.geometries.map((geom) =>
          geom ? transformGeometryCoordinates(geom, project) : geom
        ),
      };
    default:
      return geometry;
  }
}

export function createGeometryTransformer(srs) {
  if (srs == null || srs === 4326) {
    return (geometry) => geometry;
  }
  if (srs === 2154) {
    return (geometry) => transformGeometryCoordinates(geometry, toWgs84);
  }
  return (geometry) => geometry;
}

export function projectBboxToDatasetSrs(bbox, srs) {
  if (srs == null || srs === 4326) {
    return bbox;
  }
  if (srs !== 2154) {
    return bbox;
  }
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const corners = [
    toLambert93([minLng, minLat]),
    toLambert93([minLng, maxLat]),
    toLambert93([maxLng, minLat]),
    toLambert93([maxLng, maxLat]),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ];
}

async function openDatabase(filePath) {
  const normalizedPath = path.resolve(filePath);
  if (dbCache.has(normalizedPath)) {
    const cached = dbCache.get(normalizedPath);
    dbCache.delete(normalizedPath);
    dbCache.set(normalizedPath, cached);
    return cached;
  }

  const sql = await getSqlModule();
  const bytes = await readFile(normalizedPath);
  const db = new sql.Database(bytes);

  const metaResult = db.exec(
    "SELECT table_name, column_name, srs_id FROM gpkg_geometry_columns LIMIT 1"
  );
  if (!metaResult.length) {
    throw new Error(`GeoPackage has no geometry columns: ${normalizedPath}`);
  }
  const [tableName, columnName, srsRaw] = metaResult[0].values[0];
  const table = String(tableName);
  const column = String(columnName);
  const srs = srsRaw == null ? null : Number(srsRaw);

  let pkColumn = null;
  const pragma = db.exec(`PRAGMA table_info(${qIdent(table)})`);
  if (pragma.length) {
    for (const row of pragma[0].values) {
      if (Number(row[5]) === 1) {
        pkColumn = String(row[1]);
        break;
      }
    }
  }
  if (!pkColumn) {
    throw new Error(`No primary key found in ${table}`);
  }

  const rtreeTable = `rtree_${table}_${column}`;
  const rtreeExists =
    db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
      [rtreeTable]
    )[0]?.values?.length > 0;

  const descriptor = {
    db,
    filePath: normalizedPath,
    table,
    column,
    srs,
    pkColumn,
    rtreeTable: rtreeExists ? rtreeTable : null,
    transformGeometry: createGeometryTransformer(srs),
  };

  dbCache.set(normalizedPath, descriptor);
  if (dbCache.size > MAX_OPEN_DATABASES) {
    const oldestKey = dbCache.keys().next().value;
    const oldest = dbCache.get(oldestKey);
    if (oldest) oldest.db.close();
    dbCache.delete(oldestKey);
  }

  return descriptor;
}

export function envelopeIntersectsDatasetBbox(bytes, bbox) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 40) return true;
  if (bytes[0] !== 0x47 || bytes[1] !== 0x50) return true;
  const flags = bytes[3];
  const envelopeIndicator = (flags >> 1) & 0x7;
  if (envelopeIndicator === 0) return true;

  const littleEndian = (flags & 0x01) === 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = 8;
  const minX = view.getFloat64(base + 0, littleEndian);
  const maxX = view.getFloat64(base + 8, littleEndian);
  const minY = view.getFloat64(base + 16, littleEndian);
  const maxY = view.getFloat64(base + 24, littleEndian);

  const [bboxMinX, bboxMinY, bboxMaxX, bboxMaxY] = bbox;
  return maxX >= bboxMinX && minX <= bboxMaxX && maxY >= bboxMinY && minY <= bboxMaxY;
}

export function geometryIntersectsWgs84Bbox(geometry, bbox) {
  if (!geometry) return false;
  const [minX, minY, maxX, maxY] = bbox;
  let hit = false;

  const checkPosition = (position) => {
    if (!Array.isArray(position) || position.length < 2) return;
    const x = Number(position[0]);
    const y = Number(position[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      hit = true;
    }
  };

  const walk = (value) => {
    if (hit || !Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      checkPosition(value);
      return;
    }
    value.forEach((item) => walk(item));
  };

  if (geometry.type === "GeometryCollection") {
    (geometry.geometries || []).forEach((geom) => {
      if (!hit) hit = geometryIntersectsWgs84Bbox(geom, bbox);
    });
    return hit;
  }

  walk(geometry.coordinates);
  return hit;
}

export async function queryGeoPackageByBbox({
  filePath,
  bbox,
  maxFeatures = 5000,
  geometryTypes = null,
}) {
  const descriptor = await openDatabase(filePath);
  const datasetBbox = projectBboxToDatasetSrs(bbox, descriptor.srs);
  const [minX, minY, maxX, maxY] = datasetBbox;

  const table = qIdent(descriptor.table);
  const geomColumn = qIdent(descriptor.column);
  const pkColumn = qIdent(descriptor.pkColumn);

  const parseRowToFeature = (row) => {
    const props = {};
    let geometry = null;
    let id;
    let geometryBlob = null;

    for (const [key, value] of Object.entries(row)) {
      if (key === descriptor.column) {
        if (value instanceof Uint8Array) {
          geometryBlob = value;
        }
      } else {
        props[key] = value;
        if (key === descriptor.pkColumn) {
          id = value;
        }
      }
    }

    if (!geometryBlob) return null;
    if (!envelopeIntersectsDatasetBbox(geometryBlob, datasetBbox)) return null;

    geometry = parseGeoPackageGeometry(geometryBlob);
    if (!geometry) return null;

    const transformed = descriptor.transformGeometry(geometry);
    if (geometryTypes && !geometryTypes.has(transformed.type)) return null;
    if (!geometryIntersectsWgs84Bbox(transformed, bbox)) return null;

    return {
      type: "Feature",
      id,
      geometry: transformed,
      properties: props,
    };
  };

  const features = [];
  let usedRtree = false;

  if (descriptor.rtreeTable) {
    const rtreeQuery =
      `SELECT t.* FROM ${table} t` +
      ` JOIN ${qIdent(descriptor.rtreeTable)} r` +
      ` ON t.${pkColumn} = r.id` +
      " WHERE r.maxx >= ? AND r.minx <= ? AND r.maxy >= ? AND r.miny <= ?" +
      " LIMIT ?";

    try {
      const stmt = descriptor.db.prepare(rtreeQuery);
      stmt.bind([minX, maxX, minY, maxY, maxFeatures]);
      usedRtree = true;
      while (stmt.step()) {
        const feature = parseRowToFeature(stmt.getAsObject());
        if (!feature) continue;
        features.push(feature);
      }
      stmt.free();
    } catch (error) {
      const message = String(error?.message || "");
      if (!message.includes("no such module: rtree")) {
        throw error;
      }
    }
  }

  if (!usedRtree) {
    const fallbackQuery = `SELECT t.* FROM ${table} t WHERE t.${geomColumn} IS NOT NULL`;
    const stmt = descriptor.db.prepare(fallbackQuery);
    while (stmt.step()) {
      const feature = parseRowToFeature(stmt.getAsObject());
      if (!feature) continue;
      features.push(feature);
      if (features.length >= maxFeatures) break;
    }
    stmt.free();
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

export function closeGeoPackageCache() {
  for (const entry of dbCache.values()) {
    entry.db.close();
  }
  dbCache.clear();
}
