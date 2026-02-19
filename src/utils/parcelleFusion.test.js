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

  it("supprime les trous de la géométrie fusionnée pour éviter les obstacles internes", () => {
    const outer = {
      type: "Feature",
      id: "outer",
      properties: { nom: "Outer" },
      geometry: {
        type: "Polygon",
        coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]],
      },
    };
    const inner = {
      type: "Feature",
      id: "inner",
      properties: { nom: "Inner" },
      geometry: {
        type: "Polygon",
        coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
      },
    };

    const result = mergeFeaturesByIds([outer, inner], ["outer", "inner"], "outer");

    expect(result.feature.geometry.type).toBe("Polygon");
    expect(result.feature.geometry.coordinates).toHaveLength(1);
  });

  it("comble les petites bordures espacées de 1 mètre ou moins", () => {
    const meterInDegrees = 1 / 111320;
    const left = {
      type: "Feature",
      id: "left",
      properties: { nom: "Left" },
      geometry: {
        type: "Polygon",
        coordinates: [[[0, 0], [0.0001, 0], [0.0001, 0.0001], [0, 0.0001], [0, 0]]],
      },
    };
    const right = {
      type: "Feature",
      id: "right",
      properties: { nom: "Right" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0.0001 + meterInDegrees * 0.8, 0],
            [0.0002 + meterInDegrees * 0.8, 0],
            [0.0002 + meterInDegrees * 0.8, 0.0001],
            [0.0001 + meterInDegrees * 0.8, 0.0001],
            [0.0001 + meterInDegrees * 0.8, 0],
          ],
        ],
      },
    };

    const result = mergeFeaturesByIds([left, right], ["left", "right"], "left");

    expect(result.feature.geometry.type).toBe("Polygon");
  });
});
