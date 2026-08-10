import { describe, expect, it } from "vitest";
import { buildFilterExpression, matchesFilters } from "./parcellesFilters";

describe("parcellesFilters", () => {
  it("builds year and culture clauses", () => {
    const expression = buildFilterExpression({ year: "2024", cultures: ["Ble", "Mais"] });
    expect(expression[0]).toBe("all");
    expect(expression).toEqual([
      "all",
      [
        "==",
        ["to-number", ["coalesce", ["get", "annee"], -999999], -999999],
        2024,
      ],
      ["in", ["coalesce", ["get", "culture"], ""], ["literal", ["Ble", "Mais"]]],
    ]);
  });

  it("builds unknown year clause", () => {
    const expression = buildFilterExpression({ year: "unknown" });
    expect(expression).toEqual([
      "==",
      ["to-number", ["coalesce", ["get", "annee"], -999999], -999999],
      -999999,
    ]);
  });
});

describe("matchesFilters", () => {
  const feature = (properties) => ({ type: "Feature", properties });

  it("accepte tout quand aucun filtre n'est posé", () => {
    expect(matchesFilters(feature({ annee: 2024 }), null)).toBe(true);
    expect(matchesFilters(feature({ annee: 2024 }), { year: "all", cultures: [] })).toBe(true);
  });

  it("filtre sur l'année", () => {
    expect(matchesFilters(feature({ annee: 2024 }), { year: "2024" })).toBe(true);
    expect(matchesFilters(feature({ annee: 2023 }), { year: "2024" })).toBe(false);
  });

  it("filtre les années inconnues", () => {
    expect(matchesFilters(feature({}), { year: "unknown" })).toBe(true);
    expect(matchesFilters(feature({ annee: 2024 }), { year: "unknown" })).toBe(false);
  });

  it("filtre sur la liste de cultures", () => {
    expect(matchesFilters(feature({ culture: "Blé" }), { cultures: ["Blé", "Maïs"] })).toBe(true);
    expect(matchesFilters(feature({ culture: "Orge" }), { cultures: ["Blé", "Maïs"] })).toBe(false);
    expect(matchesFilters(feature({ culture: "Orge" }), { cultures: [] })).toBe(true);
  });

  it("combine année et cultures", () => {
    const filters = { year: "2024", cultures: ["Blé"] };
    expect(matchesFilters(feature({ annee: 2024, culture: "Blé" }), filters)).toBe(true);
    expect(matchesFilters(feature({ annee: 2024, culture: "Orge" }), filters)).toBe(false);
    expect(matchesFilters(feature({ annee: 2023, culture: "Blé" }), filters)).toBe(false);
  });
});
