import { toLambert93, toWgs84 } from "./proj";

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
  const pts = ringLonLat.map(([lon, lat]) => toLambert93([lon, lat]));
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

// Calcule le centroïde d'un anneau (lon/lat) et le renvoie en WGS84
export function ringCentroidLonLat(ringLonLat) {
  if (!Array.isArray(ringLonLat) || ringLonLat.length < 3) {
    return null;
  }

  const closedRing =
    ringLonLat[0][0] === ringLonLat[ringLonLat.length - 1][0] &&
    ringLonLat[0][1] === ringLonLat[ringLonLat.length - 1][1]
      ? ringLonLat
      : [...ringLonLat, ringLonLat[0]];

  const pts = closedRing.map(([lon, lat]) => toLambert93([lon, lat]));
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }

  if (!twiceArea) {
    const avgX = pts.reduce((sum, [x]) => sum + x, 0) / pts.length;
    const avgY = pts.reduce((sum, [, y]) => sum + y, 0) / pts.length;
    const [lon, lat] = toWgs84([avgX, avgY]);
    return [lon, lat];
  }

  const areaFactor = twiceArea * 3;
  const [lon, lat] = toWgs84([cx / areaFactor, cy / areaFactor]);
  return [lon, lat];
}
