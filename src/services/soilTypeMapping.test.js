import { describe, expect, it } from "vitest";
import {
  applySequentialSoilMapping,
  buildMappingCsv,
  parseMappingCsv,
} from "./soilTypeMapping";

describe("soilTypeMapping sequential engine", () => {
  it("applique les règles dans l'ordre puis le résiduel", () => {
    const parcels = [
      { soilRow: { profondeur: "profond", texture: "limoneux" }, surfaceHa: 1 },
      { soilRow: { profondeur: "profond", texture: "sableux" }, surfaceHa: 2 },
      { soilRow: { profondeur: "superficiel", texture: "argileux" }, surfaceHa: 3 },
    ];

    const configuration = {
      soilTypes: [
        {
          name: "Sol profond",
          residual: false,
          attributes: {
            profondeur: { include: ["profond"], exclude: [], nullMode: "ANY" },
            texture: { include: [], exclude: ["sableux"], nullMode: "ANY" },
          },
        },
        {
          name: "Autres sols",
          residual: true,
          attributes: {},
        },
      ],
    };

    const { assignments, remainingIndices } = applySequentialSoilMapping(parcels, configuration);

    expect(assignments[0]?.soilTypeName).toBe("Sol profond");
    expect(assignments[1]?.soilTypeName).toBe("Autres sols");
    expect(assignments[2]?.soilTypeName).toBe("Autres sols");
    expect(remainingIndices.size).toBe(0);
  });

  it("importe et exporte le CSV de configuration", () => {
    const configuration = {
      soilTypes: [
        {
          name: "Terrefort",
          residual: false,
          attributes: {
            texture: { include: ["argileux", "limono-argileux"], exclude: [], nullMode: "ANY" },
            ph_classe: { include: [], exclude: [], nullMode: "IS_NOT_NULL" },
          },
        },
      ],
    };

    const csv = buildMappingCsv(configuration);
    const parsed = parseMappingCsv(csv);

    expect(parsed.soilTypes).toHaveLength(1);
    expect(parsed.soilTypes[0].name).toBe("Terrefort");
    expect(parsed.soilTypes[0].attributes.texture.include).toEqual(["argileux", "limono-argileux"]);
    expect(parsed.soilTypes[0].attributes.ph_classe.nullMode).toBe("IS_NOT_NULL");
  });
});
