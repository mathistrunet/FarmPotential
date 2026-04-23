import { describe, expect, it } from "vitest";
import {
  applyCorrespondencesAndMerge,
  DEFAULT_PRECEDENT_N1_FIELD,
  DEFAULT_PRECEDENT_N2_FIELD,
  getOldYearCulture,
  getOldYearPrevious,
  getTargetPreviousFieldN1,
  buildParcellesByYearFromFeatures,
} from "./fusion";

// ─── Helper ─────────────────────────────────────────────────────────────────

function feature(id, year, extra = {}) {
  return {
    type: "Feature",
    id,
    geometry: { type: "Polygon", coordinates: [] },
    properties: { annee: year, ...extra },
  };
}

// ─── Constantes ──────────────────────────────────────────────────────────────

describe("DEFAULT_PRECEDENT_N1_FIELD", () => {
  it('vaut "cultureN1" (lu par ParcelleEditor comme colonne N-1)', () => {
    expect(DEFAULT_PRECEDENT_N1_FIELD).toBe("cultureN1");
  });

  it('DEFAULT_PRECEDENT_N2_FIELD vaut "precedent_N2"', () => {
    expect(DEFAULT_PRECEDENT_N2_FIELD).toBe("precedent_N2");
  });
});

// ─── getOldYearCulture ────────────────────────────────────────────────────────

describe("getOldYearCulture", () => {
  it("lit culture", () => {
    expect(getOldYearCulture(feature("f", 2023, { culture: "BLE" }))).toBe("BLE");
  });

  it("lit cultureN", () => {
    expect(getOldYearCulture(feature("f", 2023, { cultureN: "FEV" }))).toBe("FEV");
  });

  it("lit code_culture", () => {
    expect(getOldYearCulture(feature("f", 2023, { code_culture: "ORG" }))).toBe("ORG");
  });

  it("retourne null si aucune clé culture", () => {
    expect(getOldYearCulture(feature("f", 2023, { ilot: "3" }))).toBeNull();
  });
});

// ─── getOldYearPrevious ───────────────────────────────────────────────────────

describe("getOldYearPrevious", () => {
  it("lit cultureN1 (clé N-1 directe)", () => {
    expect(getOldYearPrevious(feature("f", 2023, { cultureN1: "FEV" }))).toBe("FEV");
  });

  it("lit precedent comme fallback N-1", () => {
    expect(getOldYearPrevious(feature("f", 2023, { precedent: "ORG" }))).toBe("ORG");
  });

  it("retourne null si aucune clé précédent", () => {
    expect(getOldYearPrevious(feature("f", 2023, { culture: "BLE" }))).toBeNull();
  });
});

// ─── getTargetPreviousFieldN1 ─────────────────────────────────────────────────

describe("getTargetPreviousFieldN1", () => {
  it('retourne DEFAULT_PRECEDENT_N1_FIELD si pas de clé N-1 existante', () => {
    expect(getTargetPreviousFieldN1(feature("f", 2024, {}))).toBe("cultureN1");
  });

  it("préserve une clé N-1 existante dans les props", () => {
    expect(
      getTargetPreviousFieldN1(feature("f", 2024, { cultureN_1: "" }))
    ).toBe("cultureN_1");
  });
});

// ─── buildParcellesByYearFromFeatures ─────────────────────────────────────────

describe("buildParcellesByYearFromFeatures", () => {
  it("groupe les features par année", () => {
    const features = [
      feature("a", 2023, { culture: "BLE" }),
      feature("b", 2024, { culture: "MAI" }),
      feature("c", 2023, { culture: "FEV" }),
    ];
    const result = buildParcellesByYearFromFeatures(features);
    expect(result[2023].features).toHaveLength(2);
    expect(result[2024].features).toHaveLength(1);
  });

  it("ignore les features sans année valide", () => {
    const result = buildParcellesByYearFromFeatures([
      feature("x", NaN, {}),
      { type: "Feature", id: "y", geometry: null, properties: {} },
    ]);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ─── applyCorrespondencesAndMerge ─────────────────────────────────────────────

describe("applyCorrespondencesAndMerge — dropOldYear=true", () => {
  it("vide l'année ancienne et propage la culture dans cultureN1", () => {
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
    // culture ancienne → cultureN1 (affiché par ParcelleEditor comme colonne N-1)
    expect(result.parcellesByYear[2024].features[0].properties.cultureN1).toBe("BLE");
    // culture récente conservée
    expect(result.parcellesByYear[2024].features[0].properties.culture).toBe("MAI");
  });
});

describe("applyCorrespondencesAndMerge — propagation culture offset=1", () => {
  it("préserve cultureN1 quand l'ancienne feature vient d'un import offset=1", () => {
    // Import offset=1 : la culture est directement dans cultureN1, pas dans culture
    const oldMatched = feature("old-1", 2023, { cultureN1: "FEV" });
    const recent = feature("new-1", 2024, { culture: "MAI" });

    const result = applyCorrespondencesAndMerge({
      parcellesByYear: {
        2023: { type: "FeatureCollection", features: [oldMatched] },
        2024: { type: "FeatureCollection", features: [recent] },
      },
      oldYear: 2023,
      newYear: 2024,
      correspondancesValidated: { "old-1": "new-1" },
      dropOldYear: true,
    });

    const merged = result.parcellesByYear[2024].features[0].properties;
    // mergeParcelleProperties copie cultureN1 de l'ancienne (la récente n'en a pas)
    expect(merged.cultureN1).toBe("FEV");
    expect(merged.culture).toBe("MAI");
  });
});

describe("applyCorrespondencesAndMerge — dropOldYear=false", () => {
  it("conserve les features non associées de l'ancienne année", () => {
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
      dropOldYear: false,
    });

    // old-1 retiré (associé), old-2 conservé (non associé)
    expect(result.parcellesByYear[2023].features).toHaveLength(1);
    expect(result.parcellesByYear[2023].features[0].id).toBe("old-2");
  });

  it("la feature récente associée reçoit matchMergedFromYear", () => {
    const result = applyCorrespondencesAndMerge({
      parcellesByYear: {
        2023: { type: "FeatureCollection", features: [feature("old-1", 2023, { culture: "BLE" })] },
        2024: { type: "FeatureCollection", features: [feature("new-1", 2024, { culture: "MAI" })] },
      },
      oldYear: 2023,
      newYear: 2024,
      correspondancesValidated: { "old-1": "new-1" },
      dropOldYear: false,
    });

    expect(result.parcellesByYear[2024].features[0].properties.matchMergedFromYear).toBe(2023);
  });
});

describe("applyCorrespondencesAndMerge — features non associées inchangées", () => {
  it("les features récentes sans correspondance ne sont pas modifiées", () => {
    const result = applyCorrespondencesAndMerge({
      parcellesByYear: {
        2023: { type: "FeatureCollection", features: [feature("old-1", 2023, { culture: "BLE" })] },
        2024: {
          type: "FeatureCollection",
          features: [
            feature("new-1", 2024, { culture: "MAI" }),
            feature("new-2", 2024, { culture: "COL" }),
          ],
        },
      },
      oldYear: 2023,
      newYear: 2024,
      correspondancesValidated: { "old-1": "new-1" },
      dropOldYear: true,
    });

    const unchanged = result.parcellesByYear[2024].features.find((f) => f.id === "new-2");
    expect(unchanged.properties.culture).toBe("COL");
    expect(unchanged.properties.cultureN1).toBeUndefined();
    expect(unchanged.properties.matchMergedFromYear).toBeUndefined();
  });
});

describe("applyCorrespondencesAndMerge — année manquante", () => {
  it("retourne parcellesByYear inchangé si oldYear absent", () => {
    const parcellesByYear = {
      2024: { type: "FeatureCollection", features: [feature("new-1", 2024, {})] },
    };
    const result = applyCorrespondencesAndMerge({
      parcellesByYear,
      oldYear: 2023,
      newYear: 2024,
      correspondancesValidated: {},
      dropOldYear: true,
    });
    expect(result.parcellesByYear).toBe(parcellesByYear);
  });

  it("retourne parcellesByYear inchangé si newYear absent", () => {
    const parcellesByYear = {
      2023: { type: "FeatureCollection", features: [feature("old-1", 2023, {})] },
    };
    const result = applyCorrespondencesAndMerge({
      parcellesByYear,
      oldYear: 2023,
      newYear: 2024,
      correspondancesValidated: {},
      dropOldYear: true,
    });
    expect(result.parcellesByYear).toBe(parcellesByYear);
  });
});

describe("applyCorrespondencesAndMerge — correspondances vides", () => {
  it("aucune modification si correspondancesValidated est vide", () => {
    const result = applyCorrespondencesAndMerge({
      parcellesByYear: {
        2023: { type: "FeatureCollection", features: [feature("old-1", 2023, { culture: "BLE" })] },
        2024: { type: "FeatureCollection", features: [feature("new-1", 2024, { culture: "MAI" })] },
      },
      oldYear: 2023,
      newYear: 2024,
      correspondancesValidated: {},
      dropOldYear: true,
    });

    // Avec dropOldYear=true mais aucune correspondance, l'ancienne année est vidée
    expect(result.parcellesByYear[2023].features).toEqual([]);
    expect(result.parcellesByYear[2024].features[0].properties.cultureN1).toBeUndefined();
  });
});

describe("applyCorrespondencesAndMerge — propagation de cultureN1 existante", () => {
  it("ne remplace pas cultureN1 si la feature récente en a déjà une", () => {
    // La nouvelle feature a déjà une valeur en N-1 → ne pas écraser
    const oldFeature = feature("old-1", 2023, { culture: "BLE" });
    const newFeature = feature("new-1", 2024, { culture: "MAI", cultureN1: "DEJA" });

    const result = applyCorrespondencesAndMerge({
      parcellesByYear: {
        2023: { type: "FeatureCollection", features: [oldFeature] },
        2024: { type: "FeatureCollection", features: [newFeature] },
      },
      oldYear: 2023,
      newYear: 2024,
      correspondancesValidated: { "old-1": "new-1" },
      dropOldYear: true,
    });

    expect(result.parcellesByYear[2024].features[0].properties.cultureN1).toBe("DEJA");
  });
});
