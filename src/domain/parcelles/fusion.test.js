import { describe, expect, it } from "vitest";
import {
  applyCorrespondencesAndMerge,
  getOldYearCulture,
  getOldYearPrevious,
  buildParcellesByYearFromFeatures,
} from "./fusion";
import { getCultureColumn, readCultureValue } from "./cultureColumns";

// ─── Helpers ────────────────────────────────────────────────────────────────

function feature(id, year, extra = {}) {
  return {
    type: "Feature",
    id,
    geometry: { type: "Polygon", coordinates: [] },
    properties: { annee: year, ...extra },
  };
}

/**
 * Lit une colonne comme le fait le tableau : par tous ses alias. Une assertion
 * sur une clé précise passerait à côté d'une valeur rangée sous un alias voisin,
 * ce qui est précisément le défaut que ces tests surveillent.
 */
const colonne = (props, id) => readCultureValue(props, getCultureColumn(id)) || null;

/** Fusionne une parcelle ancienne dans une parcelle conservée. */
const fusionner = (oldFeature, newFeature, oldYear, newYear) =>
  applyCorrespondencesAndMerge({
    parcellesByYear: {
      [oldYear]: { type: "FeatureCollection", features: [oldFeature] },
      [newYear]: { type: "FeatureCollection", features: [newFeature] },
    },
    oldYear,
    newYear,
    correspondancesValidated: { [oldFeature.id]: newFeature.id },
    dropOldYear: true,
    onWarning: () => {},
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
  it("vide l'année ancienne et verse la culture dans la même colonne", () => {
    const oldMatched = feature("old-1", 2023, { cultureN_1: "BLE" });
    const oldUnmatched = feature("old-2", 2023, { cultureN_1: "ORG" });
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
      onWarning: () => {},
    });

    const merged = result.parcellesByYear[2024].features[0].properties;
    expect(result.parcellesByYear[2023].features).toEqual([]);
    expect(result.parcellesByYear[2024].features).toHaveLength(1);
    expect(colonne(merged, "prev1")).toBe("BLE");
    expect(colonne(merged, "current")).toBe("MAI");
  });
});

describe("applyCorrespondencesAndMerge — les colonnes ne bougent pas", () => {
  it("laisse en N-1 une culture rangée en N-1 avant la comparaison", () => {
    // Cas signalé en usage : un parcellaire importé en N-2, déplacé en N-1 à la
    // main, puis comparé — les cultures repartaient en N-2.
    const ancienne = feature("old-1", 2024, { cultureN_1: "BTH" });
    const conservee = feature("new-1", 2025, { cultureN: "MIS" });

    const merged = fusionner(ancienne, conservee, 2024, 2025)
      .parcellesByYear[2025].features[0].properties;

    expect(colonne(merged, "current")).toBe("MIS");
    expect(colonne(merged, "prev1")).toBe("BTH");
    expect(colonne(merged, "prev2")).toBeNull();
  });

  it("conserve chaque colonne à sa place, quel que soit l'écart d'années", () => {
    const ancienne = feature("old-1", 2022, {
      cultureN_1: "BTH",
      cultureN_2: "ORH",
      cultureN_3: "TRN",
    });
    const conservee = feature("new-1", 2025, { cultureN: "MIS" });

    const merged = fusionner(ancienne, conservee, 2022, 2025)
      .parcellesByYear[2025].features[0].properties;

    expect(colonne(merged, "prev1")).toBe("BTH");
    expect(colonne(merged, "prev2")).toBe("ORH");
    expect(colonne(merged, "prev3")).toBe("TRN");
    expect(colonne(merged, "prev4")).toBeNull();
  });

  it("ne laisse pas deux valeurs différentes sous deux alias d'une même colonne", () => {
    // L'ancienne range son N-1 sous l'alias Télépac, la conservée n'a rien :
    // la valeur doit ressortir sous toutes les clés canoniques, sans doublon.
    const ancienne = feature("old-1", 2024, { cultureN1: "BTH", culture_prec2: "ORH" });
    const conservee = feature("new-1", 2025, { cultureN: "MIS" });

    const merged = fusionner(ancienne, conservee, 2024, 2025)
      .parcellesByYear[2025].features[0].properties;

    getCultureColumn("prev1").readKeys.forEach((key) => {
      if (merged[key] != null) expect(merged[key]).toBe("BTH");
    });
    getCultureColumn("prev2").readKeys.forEach((key) => {
      if (merged[key] != null) expect(merged[key]).toBe("ORH");
    });
  });

  it("n'écrit pas dans une clé morte comme precedent_N2", () => {
    const ancienne = feature("old-1", 2024, { cultureN1: "ORH" });
    const conservee = feature("new-1", 2025, { cultureN: "MIS" });

    const merged = fusionner(ancienne, conservee, 2024, 2025)
      .parcellesByYear[2025].features[0].properties;

    expect(merged.precedent_N2).toBeUndefined();
    expect(colonne(merged, "prev1")).toBe("ORH");
  });

  it("accepte de garder l'année la plus ancienne", () => {
    const ancienne = feature("old-1", 2025, { cultureN_1: "MIS" });
    const conservee = feature("new-1", 2022, { cultureN: "BTH" });

    const merged = fusionner(ancienne, conservee, 2025, 2022)
      .parcellesByYear[2022].features[0].properties;

    expect(colonne(merged, "current")).toBe("BTH");
    expect(colonne(merged, "prev1")).toBe("MIS");
  });

  it("refuse de fusionner une année avec elle-même", () => {
    const result = applyCorrespondencesAndMerge({
      parcellesByYear: {
        2024: {
          type: "FeatureCollection",
          features: [feature("old-1", 2024, {}), feature("new-1", 2024, {})],
        },
      },
      oldYear: 2024,
      newYear: 2024,
      correspondancesValidated: { "old-1": "new-1" },
      dropOldYear: true,
      onWarning: () => {},
    });

    expect(result.error).toBeTruthy();
  });

  it("hérite des attributs non culturaux absents de la parcelle conservée", () => {
    const ancienne = feature("old-1", 2024, { cultureN_1: "BTH", type_sol: "Argilo-calcaire" });
    const conservee = feature("new-1", 2025, { cultureN: "MIS" });

    const merged = fusionner(ancienne, conservee, 2024, 2025)
      .parcellesByYear[2025].features[0].properties;

    expect(merged.type_sol).toBe("Argilo-calcaire");
    expect(merged.annee).toBe(2025);
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

describe("applyCorrespondencesAndMerge — colonne destination déjà renseignée", () => {
  it("garde la valeur de la parcelle conservée", () => {
    const oldFeature = feature("old-1", 2023, { cultureN_1: "BLE" });
    const newFeature = feature("new-1", 2024, { culture: "MAI", cultureN1: "DEJA" });

    const merged = fusionner(oldFeature, newFeature, 2023, 2024)
      .parcellesByYear[2024].features[0].properties;

    expect(colonne(merged, "prev1")).toBe("DEJA");
  });

  it("signale la valeur non reportée pour que rien ne disparaisse en silence", () => {
    const alertes = [];
    applyCorrespondencesAndMerge({
      parcellesByYear: {
        2023: { type: "FeatureCollection", features: [feature("old-1", 2023, { cultureN_1: "BLE" })] },
        2024: {
          type: "FeatureCollection",
          features: [feature("new-1", 2024, { culture: "MAI", cultureN1: "DEJA" })],
        },
      },
      oldYear: 2023,
      newYear: 2024,
      correspondancesValidated: { "old-1": "new-1" },
      dropOldYear: true,
      onWarning: (message, meta) => alertes.push({ message, meta }),
    });

    expect(alertes.some((entry) => entry.meta?.ignoree === "BLE")).toBe(true);
  });
});
