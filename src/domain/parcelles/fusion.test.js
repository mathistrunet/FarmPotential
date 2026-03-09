import { describe, expect, it } from "vitest";
import { applyCorrespondencesAndMerge } from "./fusion";

function feature(id, year, extra = {}) {
  return {
    type: "Feature",
    id,
    geometry: { type: "Polygon", coordinates: [] },
    properties: { annee: year, ...extra },
  };
}

describe("applyCorrespondencesAndMerge", () => {
  it("supprime toute l'année ancienne quand dropOldYear=true", () => {
    const oldMatched = feature("old-1", 2023, { culture: "BLE" });
    const oldUnmatched = feature("old-2", 2023, { culture: "ORG" });
    const recent = feature("new-1", 2024, { culture: "MAI" });

    const result = applyCorrespondencesAndMerge({
      parcellesByYear: {
        2023: { type: "FeatureCollection", features: [oldMatched, oldUnmatched] },
        2024: { type: "FeatureCollection", features: [recent] },
      },
      oldYear: 2023,
      newYear: 2024,
      correspondancesValidated: { "old-1": "new-1" },
      dropOldYear: true,
    });

    expect(result.parcellesByYear[2023].features).toEqual([]);
    expect(result.parcellesByYear[2024].features).toHaveLength(1);
    expect(result.parcellesByYear[2024].features[0].properties.precedent).toBe("BLE");
  });
});
