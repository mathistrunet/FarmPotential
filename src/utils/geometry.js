import { toLambert93, toWgs84 } from "./proj.js";

// Convertis les sommets du polygone dessiné en WGS en Lambert93
export function ringToGml(ringLonLat) {
  const xy = ringLonLat.map(([lon, lat]) => {
    const [x, y] = toLambert93([lon, lat]);
    return `${x.toFixed(3)},${y.toFixed(3)}`;
  });
  if (xy.length && xy[0] !== xy[xy.length - 1]) xy.push(xy[0]);
  return xy.join(" ");
}

// Calcule avec la formule du lacet l'aire du polygone
export function ringAreaM2(ringLonLat) {
  const closed = ensureClosedRing(ringLonLat);
  if (closed.length < 4) return 0;
  const pts = closed.map(([lon, lat]) => toLambert93([lon, lat]));
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
      continue;
    }
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function isValidCoordinate(coord) {
  if (!Array.isArray(coord) || coord.length < 2) return false;
  const [lon, lat] = coord;
  return Number.isFinite(lon) && Number.isFinite(lat);
}

function ensureClosedRing(ring) {
  if (!Array.isArray(ring)) return [];
  const filtered = ring.filter(isValidCoordinate);
  if (!filtered.length) return [];
  const first = filtered[0];
  const last = filtered[filtered.length - 1];
  if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) {
    return filtered;
  }
  return [...filtered, first];
}

function ringSignedStats(ringLonLat) {
  const closed = ensureClosedRing(ringLonLat);
  if (closed.length < 4) return null;
  const pts = closed.map(([lon, lat]) => toLambert93([lon, lat]));
  let crossSum = 0;
  let centroidX = 0;
  let centroidY = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const cross = x1 * y2 - x2 * y1;
    crossSum += cross;
    centroidX += (x1 + x2) * cross;
    centroidY += (y1 + y2) * cross;
  }
  if (crossSum === 0) return null;
  const area = crossSum / 2;
  const cx = centroidX / (3 * crossSum);
  const cy = centroidY / (3 * crossSum);
  return { area, cx, cy };
}

function polygonCentroidLambert(polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) {
    return null;
  }
  let totalArea = 0;
  let sumX = 0;
  let sumY = 0;
  polygon.forEach((ring, index) => {
    const stats = ringSignedStats(ring);
    if (!stats) return;
    const contribution = (index === 0 ? 1 : -1) * Math.abs(stats.area);
    totalArea += contribution;
    sumX += contribution * stats.cx;
    sumY += contribution * stats.cy;
  });
  if (!totalArea) return null;
  return { area: totalArea, cx: sumX / totalArea, cy: sumY / totalArea };
}

function polygonAreaM2Internal(polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) return 0;
  let total = ringAreaM2(polygon[0]);
  for (let i = 1; i < polygon.length; i++) {
    total -= ringAreaM2(polygon[i]);
  }
  return Math.max(total, 0);
}

export function featureAreaM2(feature) {
  if (!feature || !feature.geometry) return null;
  const { geometry } = feature;
  if (geometry.type === "Polygon") {
    return polygonAreaM2Internal(geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .map((polygon) => polygonAreaM2Internal(polygon))
      .reduce((sum, value) => sum + value, 0);
  }
  return null;
}

export function featureAreaHa(feature) {
  const area = featureAreaM2(feature);
  if (typeof area !== "number") return null;
  return area / 10000;
}

export function featureCentroid(feature) {
  if (!feature || !feature.geometry) return null;
  const { geometry } = feature;
  if (geometry.type === "Point") {
    const coords = geometry.coordinates;
    if (isValidCoordinate(coords)) return [coords[0], coords[1]];
    return null;
  }
  if (geometry.type === "Polygon") {
    const centroid = polygonCentroidLambert(geometry.coordinates);
    if (!centroid) return null;
    return toWgs84([centroid.cx, centroid.cy]);
  }
  if (geometry.type === "MultiPolygon") {
    let totalArea = 0;
    let sumX = 0;
    let sumY = 0;
    geometry.coordinates.forEach((polygon) => {
      const stats = polygonCentroidLambert(polygon);
      if (!stats) return;
      const absArea = Math.abs(stats.area);
      totalArea += absArea;
      sumX += absArea * stats.cx;
      sumY += absArea * stats.cy;
    });
    if (!totalArea) return null;
    return toWgs84([sumX / totalArea, sumY / totalArea]);
  }
  return null;
}

export function polygonAreaM2(polygon) {
  return polygonAreaM2Internal(polygon);
}

/**
 * Emprise géographique d'une liste de features, au format attendu par
 * `map.fitBounds` : [[ouest, sud], [est, nord]]. Renvoie null si aucune
 * coordonnée exploitable n'est trouvée.
 */
export function featuresBounds(features) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const visit = (coordinates) => {
    if (!Array.isArray(coordinates)) return;
    if (Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) {
      const [lon, lat] = coordinates;
      if (lon < west) west = lon;
      if (lat < south) south = lat;
      if (lon > east) east = lon;
      if (lat > north) north = lat;
      return;
    }
    coordinates.forEach(visit);
  };

  (features || []).forEach((feature) => visit(feature?.geometry?.coordinates));

  if (!Number.isFinite(west) || !Number.isFinite(south)) return null;
  return [
    [west, south],
    [east, north],
  ];
}
