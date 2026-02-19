import { area, buffer, featureCollection, intersect } from "@turf/turf";

const INTERSECTION_EPSILON_M2 = 1e-4;

function normalizeParcelGeometry(feature) {
  if (!feature?.geometry) return null;
  const { type } = feature.geometry;
  if (type !== "Polygon" && type !== "MultiPolygon") return null;
  return {
    type: "Feature",
    properties: feature.properties || {},
    geometry: feature.geometry,
  };
}

function shrinkByTolerance(feature, toleranceMeters) {
  if (toleranceMeters <= 0) return feature;
  const shrunk = buffer(feature, -toleranceMeters, { units: "meters" });
  if (!shrunk?.geometry) return null;
  const shrunkArea = area(shrunk);
  if (!Number.isFinite(shrunkArea) || shrunkArea <= INTERSECTION_EPSILON_M2) return null;
  return shrunk;
}

function hasMeaningfulOverlap(a, b, toleranceMeters) {
  const baseA = normalizeParcelGeometry(a);
  const baseB = normalizeParcelGeometry(b);
  if (!baseA || !baseB) return false;

  const shrinkDistance = Math.max(0, toleranceMeters / 2);
  const geomA = shrinkByTolerance(baseA, shrinkDistance);
  const geomB = shrinkByTolerance(baseB, shrinkDistance);
  if (!geomA || !geomB) return false;

  const overlap = intersect(featureCollection([geomA, geomB]));
  if (!overlap?.geometry) return false;
  return area(overlap) > INTERSECTION_EPSILON_M2;
}

export function findOverlappingParcels(features, toleranceMeters = 1) {
  const overlaps = [];
  for (let i = 0; i < features.length; i += 1) {
    for (let j = i + 1; j < features.length; j += 1) {
      if (hasMeaningfulOverlap(features[i], features[j], toleranceMeters)) {
        overlaps.push([features[i], features[j]]);
      }
    }
  }
  return overlaps;
}
