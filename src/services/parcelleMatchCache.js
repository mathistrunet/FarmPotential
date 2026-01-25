const CACHE_KEY = "parcelle_match_cache_v1";

function safeParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeCache(cache) {
  if (!cache || typeof cache !== "object") return {};
  return cache;
}

export function loadParcelleMatchCache() {
  if (typeof window === "undefined") return {};
  const raw = safeParse(window.localStorage.getItem(CACHE_KEY));
  return normalizeCache(raw);
}

export function saveParcelleMatchCache(cache) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export function cacheYearFeatures(year, features, color) {
  if (!year) return;
  const cache = loadParcelleMatchCache();
  cache[year] = {
    color: color ?? cache?.[year]?.color,
    updatedAt: new Date().toISOString(),
    collection: {
      type: "FeatureCollection",
      features: (features || []).map((feature) => ({
        type: "Feature",
        id: feature.id,
        geometry: feature.geometry,
        properties: feature.properties || {},
      })),
    },
  };
  saveParcelleMatchCache(cache);
}

export function getCachedYearEntry(year) {
  if (!year) return null;
  const cache = loadParcelleMatchCache();
  return cache?.[year] ?? null;
}
