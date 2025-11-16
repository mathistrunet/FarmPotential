import { loadGeoPackageFeatureCollection } from "../utils/geopackage.ts";
import { TOPONYMIE_REGION_PATHS } from "../config/toponymie";

const regionCache = new Map();

function normalizeRegion(code) {
  if (!code) return null;
  return code.toUpperCase();
}

export async function getToponymiePoints(regionCode) {
  const normalized = normalizeRegion(regionCode);
  if (!normalized || !TOPONYMIE_REGION_PATHS[normalized]) {
    return [];
  }
  if (regionCache.has(normalized)) {
    return regionCache.get(normalized);
  }
  const promise = loadGeoPackageFeatureCollection(
    TOPONYMIE_REGION_PATHS[normalized]
  )
    .then((collection) => {
      const points = collection.features
        .filter((feature) => feature?.geometry?.type === "Point")
        .map((feature) => ({
          coordinates: feature.geometry.coordinates,
          properties: feature.properties || {},
        }));
      return points;
    })
    .catch((error) => {
      regionCache.delete(normalized);
      throw error;
    });
  regionCache.set(normalized, promise);
  return promise;
}
