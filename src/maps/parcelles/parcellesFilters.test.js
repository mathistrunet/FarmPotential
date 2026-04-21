import { describe, expect, it } from "vitest";
import { buildFilterExpression } from "./parcellesFilters";

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
