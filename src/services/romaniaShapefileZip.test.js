import { describe, it, expect } from "vitest";
import { normalizeRomanianFeatures } from "./romaniaShapefileZip";

function feat(crop_code, crop_name = "") {
  return { type: "Feature", properties: { farm_id: "RO1", crop_code, crop_name, area_dec: "1,5", bloc_nr: "1", parcel_nr: "2" }, geometry: null };
}

describe("Romania import → code_culture (vérification comportement)", () => {
  const cases = [
    ["102", "BDH"],   // Durum wheat (winter)
    ["151", "PPR"],   // Peas (spring) — corrigé (était PHI)
    ["109", "MID"],   // Sweet maize — corrigé (était MIS)
    ["1070", "AVP"],  // Oat spring — corrigé (était AVH)
    ["152", "PHS"],   // Beans (dry) — désormais renseigné
    ["153", "LEC"],   // Lentil
    ["155", "LDH"],   // Lupine
    ["157", "PCH"],   // Chickpea
    ["207", "CHV"],   // Hemp (fiber)
    ["251", "PTC"],   // Potato
    ["973", "TRE"],   // Clover
    ["353", "TOM"],   // Tomato (field)
    ["352", "MLO"],   // Watermelon and melon
    ["111", "Arable other crop"], // Orez → pas de metacode → texte ASSOLIA conservé
  ];
  it.each(cases)("crop_code %s → %s", (code, expected) => {
    const [out] = normalizeRomanianFeatures([feat(code)]);
    expect(out.properties.code_culture).toBe(expected);
  });
});
