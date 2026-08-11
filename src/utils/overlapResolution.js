import * as polygonClipping from "polygon-clipping";
import { featureAreaM2, polygonAreaM2 } from "./geometry.js";
import { toLambert93 } from "./proj.js";

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
  const cleanedIntersection = filterClippingResult(intersection, 0);
  if (!Array.isArray(cleanedIntersection) || cleanedIntersection.length === 0) return 0;
  return cleanedIntersection.reduce((sum, polygon) => sum + polygonAreaM2(polygon), 0);
}

function hasSignificantIntersection(existingFeature, incomingFeature, minWidthMeters = 0) {
  if (!clipIntersection) return false;
  const existingGeom = getClippingGeometry(existingFeature);
  const incomingGeom = getClippingGeometry(incomingFeature);
  if (!existingGeom || !incomingGeom) return false;
  const intersection = clipIntersection(existingGeom, incomingGeom);
  const cleanedIntersection = filterClippingResult(intersection, minWidthMeters);
  return cleanedIntersection.length > 0;
}

function geometryFromClippingResult(result) {
  const cleaned = filterClippingResult(result);
  if (!Array.isArray(cleaned) || cleaned.length === 0) return null;
  if (cleaned.length === 1) {
    return { type: "Polygon", coordinates: cleaned[0] };
  }
  return { type: "MultiPolygon", coordinates: cleaned };
}

function polygonMinDimensionM(polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) return null;
  const ring = polygon[0];
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  ring.forEach(([lon, lat]) => {
    const [x, y] = toLambert93([lon, lat]);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const width = maxX - minX;
  const height = maxY - minY;
  return Math.min(width, height);
}

function filterClippingResult(result, minWidthMeters = 0.5) {
  if (!Array.isArray(result) || result.length === 0) return [];
  return result.filter((polygon) => {
    const minDim = polygonMinDimensionM(polygon);
    if (minDim == null) return false;
    if (minDim < minWidthMeters) return false;
    if (polygonAreaM2(polygon) <= 0) return false;
    return true;
  });
}

// Instanciation paresseuse du worker — une seule instance partagée
let _overlapWorker = null;
function getOverlapWorker() {
  if (!_overlapWorker) {
    _overlapWorker = new Worker(
      new URL("./overlapWorker.js", import.meta.url),
      { type: "module" }
    );
  }
  return _overlapWorker;
}

function applyOverlapOps(draw, allFeatures, { warnings, updates, deletes }) {
  const warningSet = new Set(warnings);
  const updateMap = new Map(updates.map(({ id, geometry }) => [id, geometry]));
  const deleteSet = new Set(deletes);

  // 1. Suppressions et mises à jour de géométrie (nécessitent delete + add)
  allFeatures.forEach((feature) => {
    const id = feature.id;
    if (!id) return;
    if (deleteSet.has(id)) {
      draw.delete(id);
      return;
    }
    if (updateMap.has(id)) {
      draw.delete(id);
      draw.add({ ...feature, id, geometry: updateMap.get(id), properties: feature.properties || {} });
    }
  });

  // 2. Mise à jour de overlap_warning via un draw.set() atomique.
  // On évite volontairement updateDrawFeatureProperties (chemin draw.delete + draw.add)
  // qui déclencherait des events "draw.delete" lus par refreshFromDraw avant le re-add,
  // corrompant l'état React avec une liste incomplète de features.
  const current = draw.getAll()?.features ?? [];
  const withWarnings = current.map((feature) => ({
    ...feature,
    properties: {
      ...(feature.properties || {}),
      overlap_warning: warningSet.has(feature.id) ? true : undefined,
    },
  }));
  // Nettoyer les undefined pour ne pas polluer les propriétés
  withWarnings.forEach((f) => {
    if (f.properties.overlap_warning === undefined) {
      delete f.properties.overlap_warning;
    }
  });
  draw.set({ type: "FeatureCollection", features: withWarnings });
}

/**
 * Version asynchrone — exécute le calcul O(N²) dans un Web Worker.
 * Utiliser à la place de resolveOverlappingParcels lors d'imports lourds.
 */
export async function resolveOverlappingParcelsAsync(draw, { mode = "clip" } = {}) {
  const features = draw.getAll()?.features ?? [];
  const polys = features.filter(
    (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
  );
  if (!polys.length) return;

  const worker = getOverlapWorker();
  const { ok, result, error } = await new Promise((resolve) => {
    const handler = ({ data }) => {
      worker.removeEventListener("message", handler);
      resolve(data);
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ features: polys, mode, toleranceM: 1 });
  });

  if (!ok) {
    console.warn("[OVERLAP_WORKER]", error);
    resolveOverlappingParcels(draw, { mode }); // fallback synchrone
    return;
  }

  applyOverlapOps(draw, polys, result);
}

export function resolveOverlappingParcels(draw, { mode = "clip" } = {}) {
  const overlapWarningToleranceM = 1;
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
  if (!clipIntersection || !clipDifference || mode === "warn") {
    entries.forEach((entryA, indexA) => {
      entries.slice(indexA + 1).forEach((entryB) => {
        if (hasSignificantIntersection(entryA.feature, entryB.feature, overlapWarningToleranceM)) {
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
        if (!hasSignificantIntersection(entryA, entryB, overlapWarningToleranceM)) continue;

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

  // Mise à jour de overlap_warning via un draw.set() atomique (même raison que applyOverlapOps).
  const current = draw.getAll()?.features ?? [];
  const withWarnings = current.map((feature) => {
    const props = { ...(feature.properties || {}) };
    if (warnings.has(feature.id)) {
      props.overlap_warning = true;
    } else {
      delete props.overlap_warning;
    }
    return { ...feature, properties: props };
  });
  draw.set({ type: "FeatureCollection", features: withWarnings });
}
