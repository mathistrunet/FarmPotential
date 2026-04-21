// Web Worker — calcul d'intersection des polygones hors du thread principal
import * as polygonClipping from "polygon-clipping";
import proj4 from "proj4";

proj4.defs(
  "EPSG:2154",
  "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
);
const toLambert93 = ([lon, lat]) => proj4("EPSG:4326", "EPSG:2154", [lon, lat]);

const pcModule = polygonClipping;
const clipIntersection = pcModule.intersection ?? pcModule.default?.intersection;
const clipDifference = pcModule.difference ?? pcModule.default?.difference;

function getClippingGeometry(geometry) {
  if (!geometry) return null;
  const { type, coordinates } = geometry;
  if (type === "Polygon" || type === "MultiPolygon") return coordinates;
  return null;
}

function polygonAreaM2(polygon) {
  if (!Array.isArray(polygon) || !polygon.length) return 0;
  const ring = polygon[0];
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = toLambert93(ring[i]);
    const [xj, yj] = toLambert93(ring[j]);
    area += (xj + xi) * (yj - yi);
  }
  return Math.abs(area / 2);
}

function featureAreaM2(geometry) {
  if (!geometry) return 0;
  if (geometry.type === "Polygon") return polygonAreaM2(geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce((sum, poly) => sum + polygonAreaM2(poly), 0);
  }
  return 0;
}

function polygonMinDimM(polygon) {
  if (!Array.isArray(polygon) || !polygon.length) return null;
  const ring = polygon[0];
  if (!Array.isArray(ring) || !ring.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const coord of ring) {
    const [x, y] = toLambert93(coord);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return null;
  return Math.min(maxX - minX, maxY - minY);
}

function filterResult(result, minWidth = 0.5) {
  if (!Array.isArray(result) || !result.length) return [];
  return result.filter((polygon) => {
    const dim = polygonMinDimM(polygon);
    return dim != null && dim >= minWidth && polygonAreaM2(polygon) > 0;
  });
}

function hasSignificantIntersection(geomA, geomB, toleranceM) {
  if (!clipIntersection) return false;
  const intersection = clipIntersection(geomA, geomB);
  return filterResult(intersection, toleranceM).length > 0;
}

function geometryFromResult(result) {
  const cleaned = filterResult(result);
  if (!cleaned.length) return null;
  return cleaned.length === 1
    ? { type: "Polygon", coordinates: cleaned[0] }
    : { type: "MultiPolygon", coordinates: cleaned };
}

function computeOverlapOps(features, mode, toleranceM) {
  const entries = features.map((f) => ({
    id: f.id,
    geometry: f.geometry,
    area: featureAreaM2(f.geometry),
    updated: false,
    deleted: false,
  }));

  const warnings = new Set();

  if (!clipIntersection || !clipDifference || mode === "warn") {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const geomA = getClippingGeometry(entries[i].geometry);
        const geomB = getClippingGeometry(entries[j].geometry);
        if (!geomA || !geomB) continue;
        if (hasSignificantIntersection(geomA, geomB, toleranceM)) {
          warnings.add(entries[i].id);
          warnings.add(entries[j].id);
        }
      }
    }
  } else {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].deleted) continue;
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[j].deleted) continue;
        const geomA = getClippingGeometry(entries[i].geometry);
        const geomB = getClippingGeometry(entries[j].geometry);
        if (!geomA || !geomB) continue;
        if (!hasSignificantIntersection(geomA, geomB, toleranceM)) continue;

        const [larger, smaller] = entries[i].area >= entries[j].area
          ? [entries[i], entries[j]]
          : [entries[j], entries[i]];

        const largerGeom = getClippingGeometry(larger.geometry);
        const smallerGeom = getClippingGeometry(smaller.geometry);
        if (!largerGeom || !smallerGeom) {
          warnings.add(larger.id);
          warnings.add(smaller.id);
          continue;
        }
        const newGeometry = geometryFromResult(clipDifference(largerGeom, smallerGeom));
        if (!newGeometry) {
          warnings.add(larger.id);
          warnings.add(smaller.id);
          continue;
        }
        larger.geometry = newGeometry;
        larger.area = featureAreaM2(newGeometry);
        larger.updated = true;
        if (larger.area <= 0) larger.deleted = true;
      }
    }
  }

  return {
    warnings: [...warnings],
    updates: entries.filter((e) => e.updated && !e.deleted).map((e) => ({ id: e.id, geometry: e.geometry })),
    deletes: entries.filter((e) => e.deleted).map((e) => e.id),
  };
}

self.onmessage = ({ data: { features, mode, toleranceM } }) => {
  try {
    const result = computeOverlapOps(features, mode, toleranceM ?? 1);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message ?? "Erreur worker overlap" });
  }
};
