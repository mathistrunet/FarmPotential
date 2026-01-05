import * as polygonClipping from "polygon-clipping";
import { featureAreaM2, polygonAreaM2 } from "./geometry";

const polygonClippingModule = polygonClipping;
const clipIntersection =
  polygonClippingModule.intersection ?? polygonClippingModule.default?.intersection;
const clipDifference =
  polygonClippingModule.difference ?? polygonClippingModule.default?.difference;

function getClippingGeometry(feature) {
  if (!feature?.geometry) return null;
  const { type, coordinates } = feature.geometry;
  if (type === "Polygon") return coordinates;
  if (type === "MultiPolygon") return coordinates;
  return null;
}

export function updateDrawFeatureProperties(draw, feature, propsToMerge) {
  const merged = { ...(feature.properties || {}), ...(propsToMerge || {}) };
  if (feature.id && typeof draw?.setFeatureProperty === "function") {
    Object.entries(merged).forEach(([key, value]) => {
      draw.setFeatureProperty(feature.id, key, value);
    });
    return;
  }
  if (typeof draw?.delete === "function" && typeof draw?.add === "function") {
    if (feature.id) draw.delete(feature.id);
    draw.add({ ...feature, properties: merged });
    return;
  }
  feature.properties = merged;
}

export function intersectionArea(existingFeature, incomingFeature) {
  if (!clipIntersection) return 0;
  const existingGeom = getClippingGeometry(existingFeature);
  const incomingGeom = getClippingGeometry(incomingFeature);
  if (!existingGeom || !incomingGeom) return 0;
  const intersection = clipIntersection(existingGeom, incomingGeom);
  if (!Array.isArray(intersection) || intersection.length === 0) return 0;
  return intersection.reduce((sum, polygon) => sum + polygonAreaM2(polygon), 0);
}

function geometryFromClippingResult(result) {
  if (!Array.isArray(result) || result.length === 0) return null;
  if (result.length === 1) {
    return { type: "Polygon", coordinates: result[0] };
  }
  return { type: "MultiPolygon", coordinates: result };
}

export function resolveOverlappingParcels(draw) {
  const features = draw.getAll()?.features ?? [];
  const entries = features
    .filter((f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon")
    .map((feature, index) => ({
      id: feature.id ?? `draw-${index}`,
      feature,
      geometry: feature.geometry,
      area: featureAreaM2(feature) ?? 0,
      updated: false,
      deleted: false,
    }));

  const warnings = new Set();
  if (!clipIntersection || !clipDifference) {
    entries.forEach((entryA, indexA) => {
      entries.slice(indexA + 1).forEach((entryB) => {
        const interArea = intersectionArea(entryA.feature, entryB.feature);
        if (interArea > 0) {
          warnings.add(entryA.id);
          warnings.add(entryB.id);
        }
      });
    });
  } else {
    for (let i = 0; i < entries.length; i += 1) {
      const entryA = entries[i];
      if (entryA.deleted) continue;
      for (let j = i + 1; j < entries.length; j += 1) {
        const entryB = entries[j];
        if (entryB.deleted) continue;
        const interArea = intersectionArea(entryA, entryB);
        if (interArea <= 0) continue;

        const [larger, smaller] =
          entryA.area >= entryB.area ? [entryA, entryB] : [entryB, entryA];
        const largerGeom = getClippingGeometry({ geometry: larger.geometry });
        const smallerGeom = getClippingGeometry({ geometry: smaller.geometry });
        if (!largerGeom || !smallerGeom) {
          warnings.add(larger.id);
          warnings.add(smaller.id);
          continue;
        }
        const diff = clipDifference(largerGeom, smallerGeom);
        const newGeometry = geometryFromClippingResult(diff);
        if (!newGeometry) {
          warnings.add(larger.id);
          warnings.add(smaller.id);
          continue;
        }
        larger.geometry = newGeometry;
        larger.area = featureAreaM2({ geometry: newGeometry }) ?? 0;
        larger.updated = true;
        if (larger.area <= 0) {
          larger.deleted = true;
        }
      }
    }
  }

  entries.forEach((entry) => {
    if (!entry.id) return;
    if (entry.deleted) {
      draw.delete(entry.id);
      return;
    }
    if (entry.updated) {
      draw.delete(entry.id);
      draw.add({
        ...entry.feature,
        id: entry.id,
        geometry: entry.geometry,
        properties: entry.feature.properties || {},
      });
    }
  });

  entries.forEach((entry) => {
    if (!entry.id || entry.deleted) return;
    updateDrawFeatureProperties(draw, entry.feature, {
      overlap_warning: warnings.has(entry.id),
    });
  });
}
