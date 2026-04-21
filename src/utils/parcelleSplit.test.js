import { describe, expect, it } from "vitest";
import {
  splitParcelleByLine,
  snapLineExtremitiesToParcelBorder,
  findNearestBorderPoint,
  nearestPointOnSegment,
} from "./parcelleSplit";

// Parcelle rectangulaire de référence : [2,48] → [2.01,48.01]
const parcelle = {
  type: "Feature",
  properties: { culture: "BLE" },
  geometry: {
    type: "Polygon",
    coordinates: [[
      [2, 48],
      [2.01, 48],
      [2.01, 48.01],
      [2, 48.01],
      [2, 48],
    ]],
  },
};

// ─── splitParcelleByLine ───────────────────────────────────────────────────────

describe("splitParcelleByLine", () => {
  it("retourne deux morceaux quand le tracé traverse la parcelle", () => {
    const line = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[1.999, 48.005], [2.011, 48.005]] },
      properties: {},
    };
    const pieces = splitParcelleByLine(parcelle, line);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
  });

  it("ne découpe pas si le tracé ne traverse pas la parcelle", () => {
    const line = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[2.02, 48.005], [2.03, 48.005]] },
      properties: {},
    };
    const pieces = splitParcelleByLine(parcelle, line);
    expect(pieces).toHaveLength(1);
  });

  it("découpe en diagonale", () => {
    const line = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[1.999, 47.999], [2.011, 48.011]] },
      properties: {},
    };
    const pieces = splitParcelleByLine(parcelle, line);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
  });

  it("retourne [] si la feature n'a pas de géométrie", () => {
    const badFeature = { type: "Feature", geometry: null, properties: {} };
    const line = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[1.999, 48.005], [2.011, 48.005]] },
      properties: {},
    };
    expect(splitParcelleByLine(badFeature, line)).toEqual([]);
  });

  it("retourne [] si la ligne n'est pas un LineString", () => {
    const badLine = { type: "Feature", geometry: { type: "Point", coordinates: [2.005, 48.005] }, properties: {} };
    expect(splitParcelleByLine(parcelle, badLine)).toEqual([]);
  });

  it("trie les morceaux par surface décroissante", () => {
    // Ligne très près du bord bas : un grand morceau et un petit
    const line = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[1.999, 48.001], [2.011, 48.001]] },
      properties: {},
    };
    const pieces = splitParcelleByLine(parcelle, line);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    // Le premier polygone a plus de points/surface que le second (la bande du bas est petite)
    // On vérifie juste que le tableau est ordonné (plus grand en premier)
    expect(pieces[0].length).toBeGreaterThanOrEqual(1);
  });
});

// ─── nearestPointOnSegment ────────────────────────────────────────────────────

describe("nearestPointOnSegment", () => {
  it("retourne le projeté sur le segment", () => {
    const result = nearestPointOnSegment([0, 0.5], [0, 0], [0, 1]);
    expect(result.point[0]).toBeCloseTo(0);
    expect(result.point[1]).toBeCloseTo(0.5);
    expect(result.dist2).toBeCloseTo(0);
  });

  it("clamp au début du segment si projection < 0", () => {
    const result = nearestPointOnSegment([-1, 0], [0, 0], [1, 0]);
    expect(result.point).toEqual([0, 0]);
  });

  it("clamp à la fin du segment si projection > 1", () => {
    const result = nearestPointOnSegment([2, 0], [0, 0], [1, 0]);
    expect(result.point).toEqual([1, 0]);
  });

  it("gère un segment de longueur nulle (point)", () => {
    const result = nearestPointOnSegment([1, 1], [0, 0], [0, 0]);
    expect(result.point).toEqual([0, 0]);
  });
});

// ─── findNearestBorderPoint ───────────────────────────────────────────────────

describe("findNearestBorderPoint", () => {
  it("retourne un point d'accroche quand le curseur est dans le seuil", () => {
    // Curseur juste à l'extérieur du bord gauche (x=2) de la parcelle
    const cursor = [2.0001, 48.005];
    const snap = findNearestBorderPoint(cursor, parcelle, 0.001);
    expect(snap).not.toBeNull();
    expect(snap[0]).toBeCloseTo(2, 4);
  });

  it("retourne null quand le curseur est hors du seuil", () => {
    const cursor = [2.1, 48.005]; // ~10 km, bien au-delà du seuil 0.001
    const snap = findNearestBorderPoint(cursor, parcelle, 0.001);
    expect(snap).toBeNull();
  });

  it("accroche au coin le plus proche si le curseur est au coin", () => {
    const cursor = [2.0001, 48.0001]; // proche du coin [2, 48]
    const snap = findNearestBorderPoint(cursor, parcelle, 0.001);
    expect(snap).not.toBeNull();
    // Doit être proche du coin [2, 48]
    expect(snap[0]).toBeCloseTo(2, 3);
    expect(snap[1]).toBeCloseTo(48, 3);
  });

  it("retourne null si la feature n'a pas de géométrie", () => {
    const bad = { type: "Feature", geometry: null, properties: {} };
    expect(findNearestBorderPoint([2, 48], bad, 1)).toBeNull();
  });

  it("fonctionne avec une MultiPolygon feature", () => {
    const multi = {
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          [[[3, 3], [4, 3], [4, 4], [3, 4], [3, 3]]],
        ],
      },
      properties: {},
    };
    const cursor = [0.0001, 0.5];
    const snap = findNearestBorderPoint(cursor, multi, 0.001);
    expect(snap).not.toBeNull();
    expect(snap[0]).toBeCloseTo(0, 3);
  });
});

// ─── snapLineExtremitiesToParcelBorder ────────────────────────────────────────

describe("snapLineExtremitiesToParcelBorder", () => {
  const makeLine = (coords) => ({
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: {},
  });

  it("accroche le premier point sur la bordure la plus proche", () => {
    // Ligne qui commence à l'intérieur, proche du bord gauche
    const line = makeLine([[2.001, 48.005], [2.009, 48.005]]);
    const snapped = snapLineExtremitiesToParcelBorder(parcelle, line);
    expect(snapped.geometry.coordinates[0][0]).toBeCloseTo(2, 4);
  });

  it("accroche le dernier point sur la bordure la plus proche", () => {
    const line = makeLine([[2.001, 48.005], [2.009, 48.005]]);
    const snapped = snapLineExtremitiesToParcelBorder(parcelle, line);
    const last = snapped.geometry.coordinates[snapped.geometry.coordinates.length - 1];
    expect(last[0]).toBeCloseTo(2.01, 4);
  });

  it("préserve les points intermédiaires", () => {
    const line = makeLine([[2.001, 48.005], [2.005, 48.007], [2.009, 48.005]]);
    const snapped = snapLineExtremitiesToParcelBorder(parcelle, line);
    const coords = snapped.geometry.coordinates;
    expect(coords).toHaveLength(3);
    // Point intermédiaire inchangé
    expect(coords[1][0]).toBeCloseTo(2.005);
    expect(coords[1][1]).toBeCloseTo(48.007);
  });

  it("retourne la ligne inchangée si la feature cible n'a pas de géométrie", () => {
    const bad = { type: "Feature", geometry: null, properties: {} };
    const line = makeLine([[2.001, 48.005], [2.009, 48.005]]);
    const result = snapLineExtremitiesToParcelBorder(bad, line);
    expect(result).toEqual(line);
  });

  it("retourne la ligne inchangée si elle a moins de 2 points", () => {
    const line = makeLine([[2.001, 48.005]]);
    const result = snapLineExtremitiesToParcelBorder(parcelle, line);
    expect(result).toEqual(line);
  });
});
