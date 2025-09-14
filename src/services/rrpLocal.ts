// Lit un shapefile .zip (RRP) depuis /public et renvoie un GeoJSON
import shp from "shpjs";

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
