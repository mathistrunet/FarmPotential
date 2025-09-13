// rrpLocal.ts — loader MBTiles (Vector Tiles) "blindé" pour Vite/MapLibre

import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import Pbf from "pbf";
import { VectorTile } from "@mapbox/vector-tile";
import { ungzip } from "pako";

type VTL = InstanceType<typeof VectorTile>["layers"][string];
export type TileCoord = { z: number; x: number; y: number };

let SQL: any;
async function getSQL() {
  if (!SQL) SQL = await initSqlJs({ locateFile: () => wasmUrl });
  return SQL;
}

const flipY = (yXYZ: number, z: number) => (1 << z) - 1 - yXYZ;
const isGzip = (b: Uint8Array) => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;
const normalizeBytes = (b: Uint8Array) => (isGzip(b) ? ungzip(b) : b);

export function pickProp<T = unknown>(
  obj: Record<string, any>,
  names: string[]
): T | undefined {
  for (const n of names) {
    const v = obj?.[n];
    if (v !== undefined && v !== null) return v as T;
  }
  return undefined;
}

/** Convert lon/lat in degrees to XYZ tile at zoom z */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const x = Math.floor(((lon + 180) / 360) * (1 << z));
  const y = Math.floor(
    (1 -
      Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
      2 *
      (1 << z)
  );
  return { x, y };
}

export interface MbtilesReader {
  /** Nom de couche (source-layer), ex. "rrp_france" */
  layerName: string;
  /** Retourne la couche VectorTile d'une tuile (ou null si absente) */
  getTileLayer: (z: number, x: number, yXYZ: number) => VTL | null;
  /** Retourne un FeatureCollection GeoJSON (WGS84) de la tuile demandée */
  getTileGeoJSON: (z: number, x: number, yXYZ: number) => GeoJSON.FeatureCollection | null;
  /** Métadonnées utiles */
  meta: { format?: string; minzoom?: number; maxzoom?: number };
  /** Fermer la DB (libérer la mémoire) */
  close: () => void;
}

/** Ouvre un MBTiles depuis une URL (fetch) et renvoie un lecteur */
export async function loadLocalRrpMbtiles(url: string): Promise<MbtilesReader> {
  const SQLmod = await getSQL();
  const ab = await (await fetch(url)).arrayBuffer();
  const u8 = new Uint8Array(ab);
  const db = new SQLmod.Database(u8);

  // --- métadonnées
  const meta: MbtilesReader["meta"] = {};
  try {
    const fmt = db.exec(`SELECT value FROM metadata WHERE name='format'`)[0]?.values?.[0]?.[0];
    meta.format = fmt ? String(fmt) : undefined;
  } catch {}
  try {
    const minz = db.exec(`SELECT value FROM metadata WHERE name='minzoom'`)[0]?.values?.[0]?.[0];
    if (minz != null) meta.minzoom = Number(minz);
  } catch {}
  try {
    const maxz = db.exec(`SELECT value FROM metadata WHERE name='maxzoom'`)[0]?.values?.[0]?.[0];
    if (maxz != null) meta.maxzoom = Number(maxz);
  } catch {}

  if (meta.format && meta.format.toLowerCase() !== "pbf") {
    throw new Error(`MBTiles non vector (format=${meta.format})`);
  }

  // --- nom de source-layer (écrit par QGIS)
  let layerName = "rrp_france";
  try {
    const raw = db.exec(`SELECT value FROM metadata WHERE name='json'`)[0]?.values?.[0]?.[0];
    if (raw) {
      const j = JSON.parse(String(raw));
      const id = j?.vector_layers?.[0]?.id;
      if (typeof id === "string" && id.length) layerName = id;
    }
  } catch {
    /* ignore, fallback rrp_france */
  }

  function getTileLayer(z: number, x: number, yXYZ: number): VTL | null {
    const yTMS = flipY(yXYZ, z);
    const stmt = db.prepare(
      `SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?`
    );
    stmt.bind([z, x, yTMS]);
    const has = stmt.step();
    if (!has) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject(); // { tile_data: Uint8Array }
    stmt.free();

    const raw: Uint8Array = row.tile_data;
    if (!(raw instanceof Uint8Array)) {
      throw new Error("tile_data n'est pas un blob binaire");
    }

    const bytes = normalizeBytes(raw);
    // DEBUG si besoin :
    // console.debug("first bytes:", Array.from(bytes.slice(0, 4)));

    const vt = new VectorTile(new Pbf(bytes));
    const lyr = vt.layers[layerName];
    return lyr ?? null;
  }

  function getTileGeoJSON(z: number, x: number, yXYZ: number): GeoJSON.FeatureCollection | null {
    const lyr = getTileLayer(z, x, yXYZ);
    if (!lyr) return null;

    const features: GeoJSON.Feature[] = [];
    for (let i = 0; i < lyr.length; i++) {
      const f = lyr.feature(i);
      // toGeoJSON(x, y, z) → GeoJSON WGS84
      const gj = f.toGeoJSON(x, yXYZ, z) as GeoJSON.Feature;
      features.push(gj);
    }
    return { type: "FeatureCollection", features };
  }

  function close() {
    try {
      db.close();
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // allow GC to free memory
    } catch {}
  }

  return { layerName, getTileLayer, getTileGeoJSON, meta, close };
}

/* ==========
   Exemples d'usage (dans ton code appelant) :

// 1) Charger le lecteur
const reader = await loadLocalRrpMbtiles("/data/02_Donnees_Travail.mbtiles");
console.log(reader.layerName, reader.meta);

// 2) Récupérer une tuile au centre de la France (z=7)
const z = 7;
const { x, y } = lonLatToTile(2.5, 46.5, z);
const fc = reader.getTileGeoJSON(z, x, y);
console.log("features in tile:", fc?.features.length);

// 3) Si tu utilises MapLibre directement en source vectorielle, tu N’AS PAS
//    besoin de décoder à la main: ajoute la source vector + "source-layer" = reader.layerName
========== */
