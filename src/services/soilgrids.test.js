import { describe, expect, it } from "vitest";
import {
  buildSoilGridsResponse,
  computeAvailableWaterFromWv,
  computeSoilIndicators,
  drainageRetentionFactor,
  parseSoilGridsProperties,
  ruIntegrationDepthCm,
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

describe("RU directe (wv0033 - wv1500)", () => {
  const depths = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm"];
  // wv en "0.1 v%" (facteur 10) : 330 -> 33.0 v% à la capacité au champ, 150 -> 15.0 v% au flétrissement.
  const wvRaw = {
    "0-5cm": 330,
    "5-15cm": 330,
    "15-30cm": 320,
    "30-60cm": 310,
    "60-100cm": 300,
  };
  const wpRaw = {
    "0-5cm": 150,
    "5-15cm": 150,
    "15-30cm": 150,
    "30-60cm": 160,
    "60-100cm": 170,
  };

  const rawWithWv = {
    properties: {
      layers: [
        makeLayer("clay", "%", { "0-5cm": 22, "5-15cm": 22, "15-30cm": 22, "30-60cm": 22, "60-100cm": 22 }),
        makeLayer("cfvo", "%", { "0-5cm": 0, "5-15cm": 0, "15-30cm": 0, "30-60cm": 0, "60-100cm": 0 }),
        makeLayer("wv0033", "cm3/dm3", wvRaw),
        makeLayer("wv1500", "cm3/dm3", wpRaw),
      ],
    },
  };

  it("normalise les wv (facteur 10) et intègre la RU sur 100 cm", () => {
    const profile = parseSoilGridsProperties(rawWithWv, { depths });
    expect(profile[0].wv0033_pct).toBeCloseTo(33.0, 1);
    expect(profile[0].wv1500_pct).toBeCloseTo(15.0, 1);

    const ru = computeAvailableWaterFromWv(profile, { rootingDepthCm: 100 });
    // RU 0-80 cm à 100 %, RU 80-100 cm à 50 % (efficacité capillaire) :
    // 18%*50 + 18%*100 + 17%*150 + 15%*300 (tout 0-80) + 13%*(200 + 200*0.5) [60-100]
    // = 9 + 18 + 25.5 + 45 + 39 = 136.5 -> arrondi 137 mm
    expect(ru.availableWater_wv_mm).toBe(137);
    expect(ru.horizonsUsed).toBe(5);
  });

  it("décote la RU des sols à ressuyage rapide (retentionFactor)", () => {
    const profile = parseSoilGridsProperties(rawWithWv, { depths });
    const plein = computeAvailableWaterFromWv(profile, { rootingDepthCm: 100 });
    const sableux = computeAvailableWaterFromWv(profile, { rootingDepthCm: 100, retentionFactor: 0.5 });
    expect(plein.availableWater_wv_mm).toBe(137);
    expect(sableux.availableWater_wv_mm).toBe(68); // 136.5 × 0.5 -> 68
    expect(sableux.retentionFactor).toBe(0.5);
  });

  it("plafonne la profondeur d'enracinement pour un Leptosol", () => {
    const profile = parseSoilGridsProperties(rawWithWv, { depths });
    const ru = computeAvailableWaterFromWv(profile, { wrbClass: "Leptosols", rootingDepthCm: 100 });
    expect(ru.rootingDepthCm).toBe(30);
    expect(ru.warnings).toContain("rooting_depth_capped_leptosol");
  });

  it("retombe sur la RU heuristique quand les wv manquent", () => {
    const profile = parseSoilGridsProperties(rawSample, { depths: ["0-5cm", "5-15cm", "15-30cm"] });
    const summary = computeSoilIndicators(profile);
    expect(summary.availableWater_wv_mm).toBeNull();
    expect(summary.availableWater_mm).toBeGreaterThan(0);
    expect(summary.warnings).toContain("ru_wv_unavailable_fallback_heuristic");
  });
});

describe("coefficient de rétention selon le ressuyage", () => {
  it("graviers 0.4 / sable 0.5 / limon 1.0 / argile 1.0 / équilibré 0.85", () => {
    expect(drainageRetentionFactor({ clay_pct: 20, silt_pct: 30, sand_pct: 50 }, 25)).toBe(0.4); // cailloux
    expect(drainageRetentionFactor({ clay_pct: 12, silt_pct: 26, sand_pct: 62 }, 5)).toBe(0.5); // sableux
    expect(drainageRetentionFactor({ clay_pct: 20, silt_pct: 60, sand_pct: 20 }, 5)).toBe(1.0); // limoneux
    expect(drainageRetentionFactor({ clay_pct: 40, silt_pct: 40, sand_pct: 20 }, 5)).toBe(1.0); // argileux
    expect(drainageRetentionFactor({ clay_pct: 25, silt_pct: 30, sand_pct: 45 }, 5)).toBe(0.85); // équilibré
  });
});

describe("profondeur d'intégration RU = 80 cm racinaire + remontée capillaire", () => {
  it("sable -> 120 cm, limon -> 180 cm, argile -> 200 cm (plafond)", () => {
    expect(ruIntegrationDepthCm({ clay_pct: 8, silt_pct: 20, sand_pct: 72 })).toBe(120); // 80 + 40
    expect(ruIntegrationDepthCm({ clay_pct: 20, silt_pct: 60, sand_pct: 20 })).toBe(180); // 80 + 100
    expect(ruIntegrationDepthCm({ clay_pct: 45, silt_pct: 45, sand_pct: 10 })).toBe(200); // 80 + 200 -> plafond
  });

  it("intègre la RU d'un sol argileux jusqu'à 2 m via l'horizon 100-200 cm", () => {
    const depths = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"];
    const wv = (v) => Object.fromEntries(depths.map((d) => [d, v]));
    const rawClay = {
      properties: {
        layers: [
          makeLayer("clay", "%", wv(45)),
          makeLayer("silt", "%", wv(45)),
          makeLayer("sand", "%", wv(10)),
          makeLayer("cfvo", "%", wv(0)),
          makeLayer("wv0033", "cm3/dm3", wv(330)), // 33 v%
          makeLayer("wv1500", "cm3/dm3", wv(230)), // 23 v% -> 10 v% disponible
        ],
      },
    };
    const profile = parseSoilGridsProperties(rawClay, { depths });
    const summary = computeSoilIndicators(profile, { wrbClass: "Chernozems" });
    // 10% disponible, intégration argileuse à 2 m, avec efficacité capillaire 50 % sous 80 cm :
    // 0-80 cm : 10% × 800 mm = 80 ; 80-200 cm : 10% × 1200 mm × 0.5 = 60 -> 140 mm
    expect(summary.availableWater_wv_depth_cm).toBe(200);
    expect(summary.availableWater_wv_mm).toBe(140);
  });
});
