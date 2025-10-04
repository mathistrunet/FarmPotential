import { toLambert93 } from "./proj";

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

export function ringCentroidLonLat(ringLonLat) {
  if (!Array.isArray(ringLonLat) || ringLonLat.length < 3) {
    return null;
  }
  const coords = ringLonLat.filter((point) => Array.isArray(point) && point.length >= 2);
  if (!coords.length) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const effective =
    coords.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]
      ? coords.slice(0, -1)
      : coords;
  if (!effective.length) return null;
  let sumLon = 0;
  let sumLat = 0;
  let count = 0;
  effective.forEach((point) => {
    const [lon, lat] = point;
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      sumLon += lon;
      sumLat += lat;
      count += 1;
    }
  });
  if (!count) return null;
  return [sumLon / count, sumLat / count];
}

// (Le calcul du centroïde utilisé dans une itération précédente a été retiré.)

