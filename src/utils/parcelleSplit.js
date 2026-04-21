import buffer from "@turf/buffer";
import * as polygonClipping from "polygon-clipping";
import { polygonAreaM2 } from "./geometry";

const polygonClippingModule = polygonClipping;
const clipDifference =
  polygonClippingModule.difference ?? polygonClippingModule.default?.difference;

function getClippingGeometry(feature) {
  if (!feature?.geometry) return null;
  if (feature.geometry.type === "Polygon") return feature.geometry.coordinates;
  if (feature.geometry.type === "MultiPolygon") return feature.geometry.coordinates;
  return null;
}

function toPolygonList(result) {
  if (!Array.isArray(result)) return [];
  return result
    .filter((polygon) => Array.isArray(polygon) && polygon.length > 0)
    .filter((polygon) => polygonAreaM2(polygon) > 0.01)
    .sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a));
}

// ─── Snap utilities ───────────────────────────────────────────────────────────

function squaredDistance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

export function nearestPointOnSegment(point, a, b) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return { point: a, dist2: squaredDistance(point, a) };
  const apx = point[0] - a[0];
  const apy = point[1] - a[1];
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const projected = [a[0] + abx * t, a[1] + aby * t];
  return { point: projected, dist2: squaredDistance(point, projected) };
}

export function getPolygonOuterRings(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    return geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).map((poly) => poly?.[0]).filter(Boolean);
  }
  return [];
}

/** Accroche les deux extrémités d'une ligne sur la bordure la plus proche de la parcelle cible. */
export function snapLineExtremitiesToParcelBorder(targetFeature, lineFeature) {
  const lineCoords = lineFeature?.geometry?.coordinates;
  if (!Array.isArray(lineCoords) || lineCoords.length < 2) return lineFeature;

  const rings = getPolygonOuterRings(targetFeature);
  if (!rings.length) return lineFeature;

  const snapEndpoint = (inputPoint) => {
    let bestPoint = inputPoint;
    let bestDist2 = Number.POSITIVE_INFINITY;

    rings.forEach((ring) => {
      for (let i = 0; i < ring.length - 1; i += 1) {
        const a = ring[i];
        const b = ring[i + 1];
        if (!a || !b) continue;
        const candidate = nearestPointOnSegment(inputPoint, a, b);
        if (candidate.dist2 < bestDist2) {
          bestPoint = candidate.point;
          bestDist2 = candidate.dist2;
        }
      }
    });

    return bestPoint;
  };

  const adjusted = lineCoords.map((coord) => [...coord]);
  adjusted[0] = snapEndpoint(adjusted[0]);
  adjusted[adjusted.length - 1] = snapEndpoint(adjusted[adjusted.length - 1]);

  return {
    ...lineFeature,
    geometry: { ...lineFeature.geometry, coordinates: adjusted },
  };
}

/**
 * Retourne le point le plus proche sur la bordure de la parcelle si le curseur
 * est dans le rayon thresholdDeg (en degrés), sinon null.
 */
export function findNearestBorderPoint(cursorPoint, feature, thresholdDeg) {
  const rings = getPolygonOuterRings(feature);
  if (!rings.length) return null;

  const threshold2 = thresholdDeg * thresholdDeg;
  let bestPoint = null;
  let bestDist2 = threshold2;

  rings.forEach((ring) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i];
      const b = ring[i + 1];
      if (!a || !b) continue;
      const candidate = nearestPointOnSegment(cursorPoint, a, b);
      if (candidate.dist2 < bestDist2) {
        bestPoint = candidate.point;
        bestDist2 = candidate.dist2;
      }
    }
  });

  return bestPoint;
}

// ─── Split ───────────────────────────────────────────────────────────────────

export function splitParcelleByLine(feature, splitLine, splitWidthMeters = 0.2) {
  if (!clipDifference) return [];
  const parcelGeometry = getClippingGeometry(feature);
  if (!parcelGeometry || splitLine?.geometry?.type !== "LineString") return [];

  const bufferedLine = buffer(splitLine, splitWidthMeters, { units: "meters" });
  const lineGeometry = getClippingGeometry(bufferedLine);
  if (!lineGeometry) return [];

  const diff = clipDifference(parcelGeometry, lineGeometry);
  return toPolygonList(diff);
}
