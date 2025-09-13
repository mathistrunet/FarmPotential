// Lit des sources RRP locales (shapefile ZIP ou MBTiles) et renvoie un GeoJSON
import shp from "shpjs";
// @ts-ignore - pas de types officiels
import initSqlJs from "sql.js";
// @ts-ignore - pas de types officiels
import Pbf from "pbf";
// @ts-ignore - pas de types officiels
import { VectorTile } from "@mapbox/vector-tile";

export type RrpGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, any>>;

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
  const SQL = await initSqlJs({ locateFile: (f: string) => `https://sql.js.org/dist/${f}` });
  const db = new SQL.Database(new Uint8Array(buf));

  const zRes = db.exec("SELECT MAX(zoom_level) AS z FROM tiles");
  const maxZoom = zRes[0]?.values[0]?.[0] as number;

  let layerName = "layer";
  const meta = db.exec("SELECT value FROM metadata WHERE name='json'");
  const metaJson = meta[0]?.values[0]?.[0];
  if (metaJson) {
    try {
      const parsed = JSON.parse(metaJson as string);
      layerName = parsed?.vector_layers?.[0]?.id ?? layerName;
    } catch {}
  }

  const rows = db.exec(
    `SELECT tile_data, tile_column, tile_row FROM tiles WHERE zoom_level = ${maxZoom}`
  )[0]?.values ?? [];
  const features: any[] = [];
  const dim = 1 << maxZoom;
  for (const [tileData, x, tmsY] of rows) {
    const y = dim - 1 - (tmsY as number); // convertit TMS -> XYZ
    const vt = new VectorTile(new Pbf(tileData as Uint8Array));
    const layer = vt.layers[layerName];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const feat = layer.feature(i).toGeoJSON(x as number, y, maxZoom);
      if (feat && feat.id == null) feat.id = features.length;
      features.push(feat);
    }
  }

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
