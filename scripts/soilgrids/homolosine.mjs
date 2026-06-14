// Grille native SoilGrids 2.0 — projection Interrupted Goode Homolosine (EPSG:152160).
//
// SoilGrids échantillonne ses valeurs sur une grille régulière de 250 m DANS la projection
// Homolosine, pas en lon/lat. Deux points tombant dans le même pixel renvoient donc des
// données identiques. Ce module mappe (lon, lat) -> (col, row) du pixel SoilGrids afin de
// dédupliquer les requêtes : toutes les parcelles d'un même pixel partagent un seul appel ISRIC.
//
// Domaine d'application : France + Roumanie (hémisphère nord, latitude > 40.74° -> demi-zone
// Mollweide de la homolosine, lobe est-eurasien de méridien central 30°). Hors de ce domaine,
// soilGridsPixel() renvoie null et l'appelant retombe sur une clé arrondie classique.
//
// Constantes calées et VALIDÉES empiriquement contre l'API ISRIC (rest.isric.org) en cherchant
// les bords de pixels réels (changements de valeur) par bissection, aux latitudes 43/44.5/46/
// 47.5/49 et longitudes 2.5→25. À lam0 = 30° (valeur standard de Goode), le résidu de phase est
// constant à −0.340 pixel avec une dispersion de seulement ±0.003 pixel (~0.8 m) sur tous les
// points testés ; cette phase est absorbée par COL_PHASE/ROW_PHASE. proj4 n'implémente pas `igh`,
// d'où cette implémentation Mollweide directe.

const R = 6378137; // rayon de la sphère igh (= demi-grand axe WGS84)
const KX = (2 * Math.SQRT2) / Math.PI; // facteur d'échelle X de Mollweide
const PX = 250; // taille de pixel SoilGrids (m)
const MINX = -19949750; // origine X de la grille (WCS DescribeCoverage)
const MAXY = 8361000; // origine Y de la grille (WCS DescribeCoverage)
const LAM0 = 30; // méridien central du lobe nord-est (°)
const PHI_BOUNDARY = 40 + 44 / 60 + 11.8 / 3600; // 40.7366° : bascule sinusoïdale/Mollweide
const COL_PHASE = 0.3394; // phase X de la grille (constante, scatter ±0.8 m ; calage ISRIC)
const ROW_PHASE = 0.1568; // offset Homolosine Yc ramené modulo pixel (calage ISRIC)
const D2R = Math.PI / 180;

// Domaine validé (France + Roumanie avec marge). Hors domaine -> grille non garantie.
const inDomain = (lon, lat) => lat >= PHI_BOUNDARY && lat <= 60 && lon >= -20 && lon <= 45;

// Angle auxiliaire de Mollweide : résout 2θ + sin2θ = π·sin(φ) par Newton.
const mollweideAux = (phiRad) => {
  let t = phiRad;
  for (let i = 0; i < 60; i += 1) {
    const delta = (2 * t + Math.sin(2 * t) - Math.PI * Math.sin(phiRad)) / (2 + 2 * Math.cos(2 * t));
    t -= delta;
    if (Math.abs(delta) < 1e-13) break;
  }
  return t;
};

/**
 * Pixel SoilGrids (col, row) contenant (lon, lat), ou null hors du domaine validé.
 * Les bords de pixels coïncident avec ceux d'ISRIC à quelques mètres près.
 */
export function soilGridsPixel(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !inDomain(lon, lat)) return null;
  const t = mollweideAux(lat * D2R);
  const x = R * KX * ((lon - LAM0) * D2R) * Math.cos(t);
  const y = R * Math.SQRT2 * Math.sin(t);
  const col = Math.floor((x - MINX) / PX + COL_PHASE);
  const row = Math.floor((MAXY - y) / PX + ROW_PHASE);
  return { col, row };
}

/**
 * Clé de déduplication par pixel SoilGrids, ou null hors domaine (repli amont sur clé arrondie).
 */
export function soilGridsPixelKey(lon, lat) {
  const pixel = soilGridsPixel(lon, lat);
  return pixel ? `igh:${pixel.col}:${pixel.row}` : null;
}

export const __testing = { soilGridsPixel, R, PX, MINX, MAXY, LAM0 };
