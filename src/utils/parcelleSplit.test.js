import { describe, expect, it } from "vitest";
import { splitParcelleByLine } from "./parcelleSplit";

describe("splitParcelleByLine", () => {
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

  it("retourne deux morceaux quand le tracé traverse la parcelle", () => {
    const line = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [1.999, 48.005],
          [2.011, 48.005],
        ],
      },
      properties: {},
    };

    const pieces = splitParcelleByLine(parcelle, line);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
  });

  it("ne découpe pas si le tracé ne traverse pas la parcelle", () => {
    const line = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [2.02, 48.005],
          [2.03, 48.005],
        ],
      },
      properties: {},
    };

    const pieces = splitParcelleByLine(parcelle, line);
    expect(pieces).toHaveLength(1);
  });
});
