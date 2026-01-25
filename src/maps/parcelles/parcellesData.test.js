import { describe, expect, it } from "vitest";

import { assignUniqueParcelNumbers } from "./parcellesData";

const buildCollection = (features) => ({
  type: "FeatureCollection",
  features,
});

describe("assignUniqueParcelNumbers", () => {
  it("uses a unique preferred key when available", () => {
    const collection = buildCollection([
      {
        type: "Feature",
        properties: { numero: "A1" },
        geometry: { type: "Polygon", coordinates: [] },
      },
      {
        type: "Feature",
        properties: { numero: "B2" },
        geometry: { type: "Polygon", coordinates: [] },
      },
    ]);

    const numbered = assignUniqueParcelNumbers(collection, {
      preferredKeys: ["numero"],
    });

    expect(numbered.features[0].properties.parcelleNo).toBe("A1");
    expect(numbered.features[1].properties.parcelleNo).toBe("B2");
  });

  it("generates sequential numbers when no unique key exists", () => {
    const collection = buildCollection([
      {
        type: "Feature",
        properties: { numero: "X" },
        geometry: { type: "Polygon", coordinates: [[[0, 0]]] },
      },
      {
        type: "Feature",
        properties: { numero: "X" },
        geometry: { type: "Polygon", coordinates: [[[1, 1]]] },
      },
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[[2, 2]]] },
      },
    ]);

    const numbered = assignUniqueParcelNumbers(collection, {
      preferredKeys: ["numero"],
    });
    const numbers = numbered.features.map((feature) => feature.properties.parcelleNo);
    const unique = new Set(numbers);

    expect(numbers).toHaveLength(3);
    expect(unique.size).toBe(3);
    expect(unique.has("1")).toBe(true);
    expect(unique.has("2")).toBe(true);
    expect(unique.has("3")).toBe(true);
  });
});
