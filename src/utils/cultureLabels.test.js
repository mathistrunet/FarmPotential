import { describe, expect, it } from "vitest";
import { labelFromCode, resolvePrecisionForCode } from "./cultureLabels";

describe("cultureLabels precision fallback", () => {
  it("n'utilise pas la derniere precision connue quand aucune precision n'est fournie", () => {
    globalThis.window = {
      CODEBOOK_EXTRA: {
        "MIS|001": "Mais grain",
        "MIS|002": "Mais ensilage",
      },
      CODEBOOK_PREVIOUS: {
        MIS: "Mais (hors mais doux)",
      },
    };

    expect(resolvePrecisionForCode("MIS", "")).toBe("");
    expect(labelFromCode("MIS")).toBe("Mais (hors mais doux)");
    expect(labelFromCode("MIS", "001")).toBe("Mais grain");
  });

  it("garde la precision quand elle est presente et valide", () => {
    globalThis.window = {
      CODEBOOK_EXTRA: {
        "BTH|001": "Ble tendre d'hiver grains",
        "BTH|002": "Ble tendre d'hiver fourrage",
      },
      CODEBOOK_PREVIOUS: {
        BTH: "Ble tendre d'hiver",
      },
    };

    expect(resolvePrecisionForCode("BTH", "002")).toBe("002");
    expect(labelFromCode("BTH", "002")).toBe("Ble tendre d'hiver fourrage");
  });
});
