import { describe, expect, it } from "vitest";

import { resolveToponymNames } from "./toponymieNameFormatting";

describe("resolveToponymNames", () => {
  it('adds "bordure" for parcels smaller than 0.15 ha', () => {
    const names = resolveToponymNames([
      { key: "a", baseName: "La Plaine", areaHa: 0.12 },
      { key: "b", baseName: "Le Bois", areaHa: 0.4 },
    ]);

    expect(names.get("a")).toBe("La Plaine bordure");
    expect(names.get("b")).toBe("Le Bois");
  });

  it("uses area at tenth for duplicate names without ha suffix", () => {
    const names = resolveToponymNames([
      { key: "a", baseName: "La Côte", areaHa: 1.26 },
      { key: "b", baseName: "La Côte", areaHa: 0.94 },
    ]);

    expect(names.get("a")).toBe("La Côte 1.3");
    expect(names.get("b")).toBe("La Côte 0.9");
  });
});
