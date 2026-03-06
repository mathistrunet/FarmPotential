import { describe, expect, it } from "vitest";
import {
  buildSoilGridsResponse,
  computeSoilIndicators,
  parseSoilGridsProperties,
} from "./soilgrids";

const makeLayer = (name, unit, values) => ({
  name,
  unit_measure: { mapped_units: unit },
  depths: Object.entries(values).map(([depth, value]) => {
    const [top, bottom] = depth.replace("cm", "").split("-");
    return {
      range: { top_depth: Number(top), bottom_depth: Number(bottom) },
      values: { mean: value, unit_measure: { mapped_units: unit } },
    };
  }),
});

const rawSample = {
  properties: {
    layers: [
      makeLayer("clay", "%", { "0-5cm": 32, "5-15cm": 30, "15-30cm": 28 }),
      makeLayer("silt", "%", { "0-5cm": 40, "5-15cm": 42, "15-30cm": 40 }),
      makeLayer("sand", "%", { "0-5cm": 28, "5-15cm": 28, "15-30cm": 32 }),
      makeLayer("bdod", "cg/cm3", { "0-5cm": 145, "5-15cm": 150, "15-30cm": 152 }),
      makeLayer("soc", "g/kg", { "0-5cm": 18, "5-15cm": 14, "15-30cm": 10 }),
      makeLayer("nitrogen", "g/kg", { "0-5cm": 1.5, "5-15cm": 1.2, "15-30cm": 0.8 }),
      makeLayer("phh2o", "pH", { "0-5cm": 6.8, "5-15cm": 6.7, "15-30cm": 6.5 }),
      makeLayer("cec", "cmol/kg", { "0-5cm": 16, "5-15cm": 15, "15-30cm": 14 }),
      makeLayer("cfvo", "%", { "0-5cm": 5, "5-15cm": 8, "15-30cm": 10 }),
    ],
  },
};

describe("soilgrids parsing", () => {
  it("normalizes units and computes indicators", () => {
    const profile = parseSoilGridsProperties(rawSample, { depths: ["0-5cm", "5-15cm", "15-30cm"] });
    const summary = computeSoilIndicators(profile);

    expect(profile[0].organicMatter_pct).toBeCloseTo(3.1, 1);
    expect(profile[0].bulkDensity_gcm3).toBeCloseTo(1.45, 2);
    expect(summary.textureClass).toBe("limono-argileux");
    expect(summary.availableWater_mm).toBeGreaterThan(100);
  });

  it("matches backend contract snapshot for 3 golden points", () => {
    const points = [
      { id: "A", lat: 43.61, lon: 1.44 },
      { id: "B", lat: 47.21, lon: -1.55 },
      { id: "C", lat: 45.76, lon: 4.84 },
    ];

    const snapshots = points.map((point) => {
      const profile = parseSoilGridsProperties(rawSample, { depths: ["0-5cm", "5-15cm", "15-30cm"] });
      const summary = computeSoilIndicators(profile);
      return buildSoilGridsResponse({
        parcelId: point.id,
        lat: point.lat,
        lon: point.lon,
        pointStrategy: "centroid",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        calcVersion: "v1.0.0",
        profile,
        summary,
      });
    });

    expect(snapshots).toMatchSnapshot();
  });
});
