import area from "@turf/area";
import centroid from "@turf/centroid";
import type { Feature, Polygon, MultiPolygon, Position } from "geojson";

export type RrpEntry = {
  id_etude: number;
  id_ucs: number;
  nom_ucs: string;
  reg_nat: string;
  alt_min: number;
  alt_mod: number;
  alt_max: number;
  nb_uts: number;
  uts: { pourcent: number; rp_2008_nom: string }[];
};

let cache: Record<string, RrpEntry> | null = null;
let colorCache: Record<string, string> | null = null;

export async function loadRrpLookup(): Promise<Record<string, RrpEntry>> {
  if (cache) return cache;
  try {
    const resp = await fetch("/rrp_lookup.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    cache = await resp.json();
  } catch (err) {
    console.warn("rrp_lookup.json introuvable", err);
    cache = {};
  }
  return cache;
}

export async function loadRrpColors(): Promise<Record<string, string>> {
  if (colorCache) return colorCache;
  try {
    const resp = await fetch("/rrp_colors.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    colorCache = await resp.json();
  } catch (err) {
    console.warn("rrp_colors.json introuvable", err);
    colorCache = {};
  }
  return colorCache;
}

export function keyFromProps(props: Record<string, any>): string {
  return `${props.NO_ETUDE}:${props.NO_UCS}`;
}

export function formatAreaHa(feature: Feature<Polygon | MultiPolygon>): string {
  const a = area(feature) / 10000; // m2 -> ha
  return a.toFixed(2);
}

export function centroidLonLat(
  feature: Feature<Polygon | MultiPolygon>
): [number, number] {
  const c = centroid(feature).geometry.coordinates as Position;
  return [Number(c[0].toFixed(5)), Number(c[1].toFixed(5))];
}
