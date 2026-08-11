import { describe, it, expect } from "vitest";
import { soilGridsPixel, soilGridsPixelKey } from "./homolosine.mjs";

// Bords de pixels RÉELS relevés sur l'API ISRIC par bissection (changement de valeur), servant
// de vérité terrain. La grille du module doit voir son index changer en franchissant chaque bord.
const COL_EDGES = [
  [2.502412, 46.0],
  [2.501237, 43.0],
  [2.500537, 49.0],
  [2.502431, 44.5],
  [2.500819, 47.5],
  [25.000206, 45.0],
  [10.000106, 46.5],
];
const ROW_EDGES = [
  [2.5, 46.001512],
  [25.0, 46.001512],
  [10.0, 47.000029],
  [25.0, 45.000393],
];

const E = 0.0002; // ~15 m : marge couvrant l'écart résiduel (~1 m) entre modèle et ISRIC

describe("soilGridsPixel — alignement sur la grille native SoilGrids", () => {
  it("change de colonne en franchissant chaque bord vertical observé sur ISRIC", () => {
    for (const [lon, lat] of COL_EDGES) {
      const a = soilGridsPixel(lon - E, lat).col;
      const b = soilGridsPixel(lon + E, lat).col;
      expect(b - a, `bord colonne @(${lon},${lat})`).toBe(1);
    }
  });

  it("change de ligne en franchissant chaque bord horizontal observé sur ISRIC", () => {
    for (const [lon, lat] of ROW_EDGES) {
      const a = soilGridsPixel(lon, lat - E).row;
      const b = soilGridsPixel(lon, lat + E).row;
      // Y décroît quand la latitude augmente : l'index de ligne diminue de 1.
      expect(a - b, `bord ligne @(${lon},${lat})`).toBe(1);
    }
  });
});

describe("soilGridsPixelKey — déduplication par pixel", () => {
  it("regroupe les points d'un même pixel ~250 m et sépare les pixels voisins", () => {
    const center = [2.5012, 46.0009];
    const sameKey = [
      [0, 0],
      [0.0004, 0],
      [-0.0004, 0],
      [0, 0.0003],
      [0, -0.0003],
    ].map(([dx, dy]) => soilGridsPixelKey(center[0] + dx, center[1] + dy));
    expect(new Set(sameKey).size).toBe(1);
    // Un point clairement dans le pixel voisin (~1 km à l'est) a une clé différente.
    expect(soilGridsPixelKey(center[0] + 0.013, center[1])).not.toBe(sameKey[0]);
  });

  it("renvoie null hors du domaine validé (repli amont sur clé arrondie)", () => {
    expect(soilGridsPixelKey(-47, -15)).toBeNull(); // Brésil (hémisphère sud)
    expect(soilGridsPixelKey(2.5, 39)).toBeNull(); // sous la bascule sinusoïdale/Mollweide
  });
});
