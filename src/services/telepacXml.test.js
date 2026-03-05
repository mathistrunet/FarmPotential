import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { buildTelepacXML } from "./telepacXml";

describe("buildTelepacXML", () => {
  it("exporte les métadonnées producteur obligatoires et une géométrie d'ilot projetée", () => {
    const features = [
      {
        type: "Feature",
        properties: {
          ilot_numero: "1",
          numero: "10",
          code: "BLE",
          code_exploitation: "123456789",
          siret: "12345678901234",
          exploitation: "Ferme de Test",
          code_insee: "49355",
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0.125, 47.115],
              [0.126, 47.115],
              [0.126, 47.116],
              [0.125, 47.116],
              [0.125, 47.115],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: {
          ilot_numero: "1",
          numero: "11",
          code: "ORH",
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0.127, 47.115],
              [0.128, 47.115],
              [0.128, 47.116],
              [0.127, 47.116],
              [0.127, 47.115],
            ],
          ],
        },
      },
    ];

    const xml = buildTelepacXML(features);
    const parser = new (new JSDOM().window.DOMParser)();
    const doc = parser.parseFromString(xml, "application/xml");

    const producteur = doc.getElementsByTagName("producteur")[0];
    expect(producteur?.getAttribute("numero-pacage")).toBe("123456789");

    const siret = doc.getElementsByTagName("siret")[0]?.textContent?.trim();
    expect(siret).toBe("12345678901234");

    const ilotCoords = doc
      .getElementsByTagName("ilot")[0]
      ?.getElementsByTagName("gml:coordinates")[0]
      ?.textContent?.trim();

    expect(ilotCoords).toBeTruthy();
    const firstPair = ilotCoords.split(/\s+/)[0];
    const [x, y] = firstPair.split(",").map(Number);

    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(100000);
    expect(x).toBeLessThanOrEqual(1200000);
    expect(y).toBeGreaterThanOrEqual(6000000);
    expect(y).toBeLessThanOrEqual(7200000);
    expect(Math.abs(x)).toBeGreaterThan(180);
    expect(Math.abs(y)).toBeGreaterThan(90);
  });

  it("force numero-ilot-reference sur 12 chiffres et une commune unique", () => {
    const features = [
      {
        type: "Feature",
        properties: {
          ilot_numero: "1",
          numero: "1",
          code: "BLE",
          code_exploitation: "123456789",
          code_insee: "49123",
          "numero-ilot-reference": "AB-12",
        },
        geometry: {
          type: "Polygon",
          coordinates: [[[0.125, 47.115],[0.126, 47.115],[0.126, 47.116],[0.125, 47.116],[0.125, 47.115]]],
        },
      },
      {
        type: "Feature",
        properties: {
          ilot_numero: "2",
          numero: "2",
          code: "ORH",
          code_insee: "99999",
        },
        geometry: {
          type: "Polygon",
          coordinates: [[[0.127, 47.115],[0.128, 47.115],[0.128, 47.116],[0.127, 47.116],[0.127, 47.115]]],
        },
      },
    ];

    const xml = buildTelepacXML(features);
    const parser = new (new JSDOM().window.DOMParser)();
    const doc = parser.parseFromString(xml, "application/xml");

    const ilots = [...doc.getElementsByTagName("ilot")];
    expect(ilots).toHaveLength(2);

    const refs = ilots.map((n) => n.getAttribute("numero-ilot-reference"));
    refs.forEach((ref) => expect(ref).toMatch(/^\d{12}$/));

    const communes = ilots.map((n) => n.getElementsByTagName("commune")[0]?.textContent?.trim());
    expect(communes).toEqual(["49123", "49123"]);
  });

  it("utilise la colonne culture sélectionnée pour le code culture exporté", () => {
    const features = [
      {
        type: "Feature",
        properties: {
          ilot_numero: "1",
          numero: "1",
          code: "BLE",
          cultureN_1: "MIS",
          code_exploitation: "123456789",
        },
        geometry: {
          type: "Polygon",
          coordinates: [[[0.125, 47.115],[0.126, 47.115],[0.126, 47.116],[0.125, 47.116],[0.125, 47.115]]],
        },
      },
    ];

    const xml = buildTelepacXML(features, { cultureColumn: "cultureN_1" });
    const parser = new (new JSDOM().window.DOMParser)();
    const doc = parser.parseFromString(xml, "application/xml");

    const code = doc.getElementsByTagName("code-culture")[0]?.textContent?.trim();
    expect(code).toBe("MIS");
  });

});
