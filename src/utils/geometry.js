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

// (Le calcul du centroïde utilisé dans une itération précédente a été retiré.)
