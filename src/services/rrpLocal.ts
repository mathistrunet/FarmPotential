// Lit des sources RRP locales (shapefile ZIP ou MBTiles) et renvoie un GeoJSON
import shp from "shpjs";
// @ts-ignore - pas de types officiels
import initSqlJs from "sql.js";
// @ts-ignore - pas de types officiels
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
// @ts-ignore - pas de types officiels
import Pbf from "pbf";
// @ts-ignore - pas de types officiels
import { ungzip } from "pako";
// @ts-ignore - pas de types officiels
import { VectorTile } from "@mapbox/vector-tile";

export type RrpGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, any>>;

function flipY(yXYZ: number, z: number) {
  return (1 << z) - 1 - yXYZ;
}

const isGzip = (b: Uint8Array) => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;
const normalize = (b: Uint8Array) => (isGzip(b) ? ungzip(b) : b);

export async function loadLocalRrpZip(zipUrl: string): Promise<RrpGeoJSON> {
  const res = await fetch(zipUrl, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Impossible de charger ${zipUrl}: ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  const gj = (await shp(buf)) as RrpGeoJSON;
  // Assure des IDs pour de meilleures perfs d’affichage/interaction
  gj.features.forEach((f, i) => {
    if (f && f.id == null) f.id = i;
  });
  return gj;
}

// Lit un fichier MBTiles vectoriel local et renvoie un GeoJSON
export async function loadLocalRrpMbtiles(mbtilesUrl: string): Promise<RrpGeoJSON> {
  const res = await fetch(mbtilesUrl, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Impossible de charger ${mbtilesUrl}: ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database(new Uint8Array(buf));

  const zRes = db.exec("SELECT MAX(zoom_level) AS z FROM tiles");
  const maxZoom = zRes[0]?.values[0]?.[0] as number;

  let layerName = "rrp_france";
  try {
    const meta = db.exec("SELECT value FROM metadata WHERE name='json'");
    const metaJson = meta[0]?.values[0]?.[0];
    if (metaJson) {
      const parsed = JSON.parse(metaJson as string);
      layerName = parsed?.vector_layers?.[0]?.id ?? layerName;
    }
  } catch {}

  const stmt = db.prepare(
    "SELECT tile_data AS td, tile_column AS x, tile_row AS y FROM tiles WHERE zoom_level = ?"
  );
  stmt.bind([maxZoom]);

  const features: any[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    const x = row.x as number;
    const y = flipY(row.y as number, maxZoom);
    const bytes = normalize(row.td as Uint8Array);
    const vt = new VectorTile(new Pbf(bytes));
    const layer = vt.layers[layerName];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const feat = layer.feature(i).toGeoJSON(x, y, maxZoom);
      if (feat && feat.id == null) feat.id = features.length;
      features.push(feat);
    }
  }
  stmt.free();

  return { type: "FeatureCollection", features };
}

/** Accès tolérant aux propriétés, car les champs varient selon les livrables */
export function pickProp<T=any>(props: Record<string, any>, candidates: string[], fallback?: T): T | undefined {
  for (const key of candidates) {
    if (props?.[key] != null) return props[key] as T;
    // essaie aussi une version case-insensitive
    const hit = Object.keys(props ?? {}).find(k => k.toLowerCase() === key.toLowerCase());
    if (hit) return props[hit] as T;
  }
  return fallback;
}
