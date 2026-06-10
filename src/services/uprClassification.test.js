import { describe, expect, it } from "vitest";
import {
  aggregateUprInputs,
  classifyParcelUpr,
  classifyUpr,
  normalizeWrbName,
} from "./uprClassification";

// Base « sol sain équilibré » réutilisée puis surchargée par test.
const base = { wrbClass: null, clay: 25, silt: 30, sand: 45, ph: 6.5, cfvo: 5, ruMm: 160 };

describe("normalizeWrbName", () => {
  it("normalise casse et espaces sans pluraliser", () => {
    expect(normalizeWrbName("GLEYSOLS")).toBe("Gleysols");
    expect(normalizeWrbName(" Vertisols ")).toBe("Vertisols");
    expect(normalizeWrbName("solonetz")).toBe("Solonetz"); // ne finit pas par "s"
    expect(normalizeWrbName(null)).toBeNull();
  });
});

describe("classifyUpr — cascade par priorité", () => {
  it("I : salé / sodique (WRB prioritaire)", () => {
    expect(classifyUpr({ ...base, wrbClass: "Solonchaks" }).code).toBe("I");
    expect(classifyUpr({ ...base, wrbClass: "Solonetz" }).code).toBe("I");
  });

  it("F : hydromorphe", () => {
    expect(classifyUpr({ ...base, wrbClass: "Gleysols" }).code).toBe("F");
    expect(classifyUpr({ ...base, wrbClass: "Stagnosols" }).code).toBe("F");
  });

  it("G : acide par pH OU par WRB", () => {
    expect(classifyUpr({ ...base, ph: 5.0 }).code).toBe("G");
    expect(classifyUpr({ ...base, ph: 6.5, wrbClass: "Podzols" }).code).toBe("G");
  });

  it("acidité prime sur RU faible (Arenosol acide -> G)", () => {
    expect(classifyUpr({ ...base, wrbClass: "Arenosols", ph: 5.0, sand: 80, ruMm: 80 }).code).toBe("G");
  });

  it("H : calcaire / superficiel (pH > 7.3 + Calcisol, ou Leptosol calcaire)", () => {
    expect(classifyUpr({ ...base, wrbClass: "Calcisols", ph: 7.8 }).code).toBe("H");
    expect(classifyUpr({ ...base, wrbClass: "Leptosols", ph: 7.8 }).code).toBe("H");
  });

  it("E : RU faible / superficialité / cailloux / sable / Leptosol non calcaire", () => {
    expect(classifyUpr({ ...base, ruMm: 80 }).code).toBe("E"); // < 90
    expect(classifyUpr({ ...base, sand: 70 }).code).toBe("E");
    expect(classifyUpr({ ...base, sand: 60 }).code).toBe("E"); // seuil sable abaissé à 55
    expect(classifyUpr({ ...base, cfvo: 25 }).code).toBe("E");
    expect(classifyUpr({ ...base, wrbClass: "Leptosols", ph: 6.5 }).code).toBe("E");
  });

  it("seuil RU = 90 mm : 89 -> E, 90 -> sol sain (fallback D)", () => {
    expect(classifyUpr({ ...base, ruMm: 89 }).code).toBe("E");
    expect(classifyUpr({ ...base, ruMm: 90 }).code).toBe("D");
  });

  it("C : vertique (Vertisol ou argile > 50%)", () => {
    expect(classifyUpr({ ...base, wrbClass: "Vertisols" }).code).toBe("C");
    expect(classifyUpr({ ...base, clay: 55 }).code).toBe("C");
  });

  it("B : argileux sain (35 <= argile <= 50)", () => {
    expect(classifyUpr({ ...base, clay: 42 }).code).toBe("B");
  });

  it("D : limoneux battant (limon > 50, argile < 30), même à RU élevée", () => {
    expect(classifyUpr({ ...base, silt: 55, clay: 12 }).code).toBe("D");
    // loess type Santerre/Palouse : argile 26, limon 63, RU élevée -> D (texture avant RU)
    expect(classifyUpr({ ...base, clay: 26, silt: 63, sand: 11, ruMm: 257 }).code).toBe("D");
  });

  it("A : équilibré profond (limon <= 50, argile 18-35) à RU élevée", () => {
    expect(classifyUpr({ ...base, clay: 25, silt: 30, sand: 45, ruMm: 160 }).code).toBe("A");
  });

  it("D : fallback quand sol sain mais RU non élevée", () => {
    expect(classifyUpr({ ...base, clay: 25, silt: 30, sand: 45, ruMm: 130 }).code).toBe("D");
  });

  it("enrichit avec label + facteur limitant", () => {
    const r = classifyUpr({ ...base, wrbClass: "Gleysols" });
    expect(r.label).toBe("Sol hydromorphe");
    expect(r.limitingFactor).toBe("excès d'eau");
  });
});

describe("aggregateUprInputs", () => {
  const profile = [
    { depth: "0-5cm", clay_pct: 20, silt_pct: 30, sand_pct: 50, ph: 6.0, cfvo_pct: 10 },
    { depth: "5-15cm", clay_pct: 24, silt_pct: 30, sand_pct: 46, ph: 6.4, cfvo_pct: 12 },
    { depth: "15-30cm", clay_pct: 30, silt_pct: 30, sand_pct: 40, ph: 6.8, cfvo_pct: 14 },
    { depth: "30-60cm", clay_pct: 34, silt_pct: 30, sand_pct: 36, ph: 7.0, cfvo_pct: 30 },
  ];

  it("pondère clay/silt/ph par épaisseur sur 0-30 cm et cfvo sur 0-60 cm", () => {
    const out = aggregateUprInputs(profile, { availableWater_wv_mm: 140 });
    // moyenne argile 0-30 = (20*5 + 24*10 + 30*15)/30 = (100+240+450)/30 = 26.33
    expect(out.clay).toBeCloseTo(26.3, 1);
    // cfvo 0-60 inclut l'horizon 30-60 = (10*5+12*10+14*15+30*30)/60 = (50+120+210+900)/60 = 21.33
    expect(out.cfvo).toBeCloseTo(21.3, 1);
    expect(out.ruMm).toBe(140);
    expect(out.ruSource).toBe("wv");
  });

  it("repli RU heuristique si wv absente", () => {
    const out = aggregateUprInputs(profile, { availableWater_mm: 120 });
    expect(out.ruMm).toBe(120);
    expect(out.ruSource).toBe("heuristic");
  });
});

describe("classifyParcelUpr — orchestration", () => {
  it("agrège puis classe et expose les entrées", () => {
    const profile = [
      { depth: "0-5cm", clay_pct: 12, silt_pct: 60, sand_pct: 28, ph: 6.5, cfvo_pct: 2 },
      { depth: "5-15cm", clay_pct: 12, silt_pct: 60, sand_pct: 28, ph: 6.5, cfvo_pct: 2 },
      { depth: "15-30cm", clay_pct: 12, silt_pct: 60, sand_pct: 28, ph: 6.5, cfvo_pct: 2 },
    ];
    const result = classifyParcelUpr(profile, { availableWater_wv_mm: 130 }, "Luvisols");
    expect(result.code).toBe("D"); // limon > 50, argile < 18
    expect(result.inputs.wrbClass).toBe("Luvisols");
    expect(result.inputs.silt).toBeCloseTo(60, 1);
  });
});
