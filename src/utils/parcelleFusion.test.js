import { describe, expect, it } from "vitest";

import { mergeFeaturesByIds } from "./parcelleFusion";

describe("mergeFeaturesByIds", () => {
  const featureA = {
    type: "Feature",
    id: "a",
    properties: { nom: "A" },
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
    },
  };
  const featureB = {
    type: "Feature",
    id: "b",
    properties: { nom: "B" },
    geometry: {
      type: "Polygon",
      coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]],
    },
  };

  it("fusionne les géométries sélectionnées et conserve les données de la parcelle choisie", () => {
    const result = mergeFeaturesByIds([featureA, featureB], ["a", "b"], "b");

    expect(result.feature.id).toBe("b");
    expect(result.feature.properties.nom).toBe("B");
    expect(result.feature.geometry.type).toBe("Polygon");
    expect(result.removedIds).toEqual(["a"]);
    expect(result.feature.properties.surfaceHa).toBeGreaterThan(0);
  });

  it("lève une erreur avec moins de deux parcelles", () => {
    expect(() => mergeFeaturesByIds([featureA], ["a"], "a")).toThrow(/au moins deux/i);
  });
});
