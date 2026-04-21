import { describe, expect, it } from "vitest";
import { featureCollectionsEqual } from "./featureCollectionEquality";

const geo1 = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
const geo2 = { type: "Polygon", coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] };

function makeFC(features) {
  return { type: "FeatureCollection", features };
}

function makeFeature(id, geometry, properties = {}) {
  return { type: "Feature", id, geometry, properties };
}

describe("featureCollectionsEqual", () => {
  it("retourne true pour la même référence", () => {
    const fc = makeFC([makeFeature("a", geo1)]);
    expect(featureCollectionsEqual(fc, fc)).toBe(true);
  });

  it("retourne true pour des collections vides", () => {
    expect(featureCollectionsEqual(makeFC([]), makeFC([]))).toBe(true);
  });

  it("retourne false si les tailles diffèrent", () => {
    const a = makeFC([makeFeature("a", geo1)]);
    const b = makeFC([makeFeature("a", geo1), makeFeature("b", geo2)]);
    expect(featureCollectionsEqual(a, b)).toBe(false);
  });

  it("retourne true si même géométrie par référence (pas de serialisation)", () => {
    const sharedGeo = { ...geo1 };
    const a = makeFC([makeFeature("a", sharedGeo, { nom: "test" })]);
    const b = makeFC([makeFeature("a", sharedGeo, { nom: "test" })]);
    expect(featureCollectionsEqual(a, b)).toBe(true);
  });

  it("retourne true si géométries différentes mais structurellement identiques", () => {
    const geoA = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
    const geoB = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
    const a = makeFC([makeFeature("a", geoA)]);
    const b = makeFC([makeFeature("a", geoB)]);
    expect(featureCollectionsEqual(a, b)).toBe(true);
  });

  it("retourne false si les géométries diffèrent", () => {
    const a = makeFC([makeFeature("a", geo1)]);
    const b = makeFC([makeFeature("a", geo2)]);
    expect(featureCollectionsEqual(a, b)).toBe(false);
  });

  it("retourne false si les ids diffèrent", () => {
    const a = makeFC([makeFeature("a", geo1)]);
    const b = makeFC([makeFeature("b", geo1)]);
    expect(featureCollectionsEqual(a, b)).toBe(false);
  });

  it("retourne false si les propriétés diffèrent", () => {
    const a = makeFC([makeFeature("a", geo1, { code: "BTH" })]);
    const b = makeFC([makeFeature("a", geo1, { code: "MIS" })]);
    expect(featureCollectionsEqual(a, b)).toBe(false);
  });

  it("retourne true si les propriétés sont structurellement identiques", () => {
    const a = makeFC([makeFeature("a", geo1, { code: "BTH", surface: 1.5 })]);
    const b = makeFC([makeFeature("a", geo1, { code: "BTH", surface: 1.5 })]);
    expect(featureCollectionsEqual(a, b)).toBe(true);
  });

  it("retourne false si une propriété est ajoutée", () => {
    const a = makeFC([makeFeature("a", geo1, { code: "BTH" })]);
    const b = makeFC([makeFeature("a", geo1, { code: "BTH", extra: true })]);
    expect(featureCollectionsEqual(a, b)).toBe(false);
  });

  it("retourne true si les features sont les mêmes références", () => {
    const feat = makeFeature("a", geo1, { code: "BTH" });
    const a = makeFC([feat]);
    const b = makeFC([feat]);
    expect(featureCollectionsEqual(a, b)).toBe(true);
  });

  it("gère null/undefined sans crash", () => {
    // null === null → true (même référence), mais pas une FeatureCollection valide
    // Dans le contexte ParcellesStore, null est toujours normalisé avant comparaison.
    // On vérifie surtout qu'il n'y a pas de crash.
    expect(() => featureCollectionsEqual(null, null)).not.toThrow();
    expect(featureCollectionsEqual(makeFC([]), null)).toBe(false);
    expect(featureCollectionsEqual(null, makeFC([]))).toBe(false);
  });

  it("compare plusieurs features dans l'ordre", () => {
    const a = makeFC([
      makeFeature("a", geo1, { code: "BTH" }),
      makeFeature("b", geo2, { code: "MIS" }),
    ]);
    const b = makeFC([
      makeFeature("a", geo1, { code: "BTH" }),
      makeFeature("b", geo2, { code: "MIS" }),
    ]);
    expect(featureCollectionsEqual(a, b)).toBe(true);
  });

  it("retourne false si l'ordre des features change", () => {
    const a = makeFC([makeFeature("a", geo1), makeFeature("b", geo2)]);
    const b = makeFC([makeFeature("b", geo2), makeFeature("a", geo1)]);
    expect(featureCollectionsEqual(a, b)).toBe(false);
  });
});
