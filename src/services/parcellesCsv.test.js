// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseParcellesCsvToFeatures, buildParcellesCsv } from "./parcellesCsv";
import {
  SEBASTIEN_CSV_TEXT,
  SEBASTIEN_CSV_EXPECTED_COUNT,
  SEBASTIEN_CSV_EXPECTED_NAMES,
  SEBASTIEN_CSV_EXPECTED_SURFACES,
} from "../__fixtures__/sebastien-2025.csv.js";

// parseParcellesCsvToFeatures uses FileReader — File is available in jsdom
function makeFile(text, name = "test.csv") {
  return new File([text], name, { type: "text/csv" });
}

describe("parseParcellesCsvToFeatures — fixture Sébastien 2025", () => {
  it(`parse exactement ${SEBASTIEN_CSV_EXPECTED_COUNT} parcelles`, async () => {
    const features = await parseParcellesCsvToFeatures(makeFile(SEBASTIEN_CSV_TEXT));
    expect(features).toHaveLength(SEBASTIEN_CSV_EXPECTED_COUNT);
  });

  it("extrait les noms de parcelles", async () => {
    const features = await parseParcellesCsvToFeatures(makeFile(SEBASTIEN_CSV_TEXT));
    const names = features.map((f) => f.properties.nom);
    expect(names).toEqual(SEBASTIEN_CSV_EXPECTED_NAMES);
  });

  it("extrait les surfaces", async () => {
    const features = await parseParcellesCsvToFeatures(makeFile(SEBASTIEN_CSV_TEXT));
    const surfaces = features.map((f) => f.properties.surface_parcelle);
    expect(surfaces).toEqual(SEBASTIEN_CSV_EXPECTED_SURFACES);
  });

  it("produit des géométries Polygon WGS84 valides", async () => {
    const features = await parseParcellesCsvToFeatures(makeFile(SEBASTIEN_CSV_TEXT));
    features.forEach((f) => {
      expect(f.type).toBe("Feature");
      expect(f.geometry.type).toBe("Polygon");
      const ring = f.geometry.coordinates[0];
      expect(ring.length).toBeGreaterThanOrEqual(4);
      ring.forEach(([lon, lat]) => {
        expect(lon).toBeGreaterThan(-180);
        expect(lon).toBeLessThan(180);
        expect(lat).toBeGreaterThan(-90);
        expect(lat).toBeLessThan(90);
      });
    });
  });

  it("ferme automatiquement les rings ouverts", async () => {
    const openRing = `Secteur;Exploitation;Numero pacage;Parcelles;Surface parcelle;Parcelle Bio;Type de sol;CultureN;CultureN1;CultureN2;CultureN3;CultureN4;Geometrie
Secteur A;Test;000;P1;1;Non;;BTH;;;;;1.35,44.01 1.36,44.01 1.36,44.02 1.35,44.02
`;
    const features = await parseParcellesCsvToFeatures(makeFile(openRing));
    expect(features).toHaveLength(1);
    const ring = features[0].geometry.coordinates[0];
    const first = ring[0];
    const last = ring[ring.length - 1];
    expect(first[0]).toBe(last[0]);
    expect(first[1]).toBe(last[1]);
  });

  it("ignore les lignes sans géométrie valide", async () => {
    const csv = `Secteur;Exploitation;Numero pacage;Parcelles;Surface parcelle;Parcelle Bio;Type de sol;CultureN;CultureN1;CultureN2;CultureN3;CultureN4;Geometrie
A;Test;000;P1;1;Non;;BTH;;;;;1.35,44.01 1.36,44.01 1.36,44.02 1.35,44.02 1.35,44.01
A;Test;000;P2;2;Non;;MIS;;;;;
A;Test;000;P3;3;Non;;TRN;;;;;invalide
`;
    const features = await parseParcellesCsvToFeatures(makeFile(csv));
    expect(features).toHaveLength(1);
    expect(features[0].properties.nom).toBe("P1");
  });

  it("extrait le code exploitation / numéro pacage", async () => {
    const features = await parseParcellesCsvToFeatures(makeFile(SEBASTIEN_CSV_TEXT));
    features.forEach((f) => {
      expect(f.properties.code_exploitation).toBe("082012345");
    });
  });

  it("extrait les cultures N et N-1", async () => {
    const features = await parseParcellesCsvToFeatures(makeFile(SEBASTIEN_CSV_TEXT));
    // Parcelle 1 : BTH + TRN (N-1)
    const p1 = features[0];
    expect(p1.properties.cultureN).toBeTruthy();
    // cultureN_1 doit être défini si N-1 est renseigné
    expect(p1.properties.cultureN_1).toBeTruthy();
  });

  it("marque la parcelle bio correctement (Oui/Non)", async () => {
    const features = await parseParcellesCsvToFeatures(makeFile(SEBASTIEN_CSV_TEXT));
    expect(features[2].properties.parcelle_bio).toBe("Oui");
    expect(features[0].properties.parcelle_bio).toBe("Non");
  });

  it("gère les délimiteurs tabulation en plus du point-virgule", async () => {
    const tabCsv = `Secteur\tExploitation\tNumero pacage\tParcelles\tSurface parcelle\tParcelle Bio\tType de sol\tCultureN\tCultureN1\tCultureN2\tCultureN3\tCultureN4\tGeometrie
A\tTest\t000\tP1\t1.5\tNon\t\tBTH\t\t\t\t\t1.35,44.01 1.36,44.01 1.36,44.02 1.35,44.02 1.35,44.01
`;
    const features = await parseParcellesCsvToFeatures(makeFile(tabCsv));
    expect(features).toHaveLength(1);
    expect(features[0].properties.surface_parcelle).toBe(1.5);
  });
});

describe("buildParcellesCsv — round-trip", () => {
  it("produit les en-têtes CSV attendus", async () => {
    const features = [
      {
        type: "Feature",
        properties: { nom: "P1", surface_parcelle: 2.5, cultureN: "BTH" },
        geometry: {
          type: "Polygon",
          coordinates: [[[1.35, 44.01], [1.36, 44.01], [1.36, 44.02], [1.35, 44.02], [1.35, 44.01]]],
        },
      },
    ];
    const csv = await buildParcellesCsv(features, "Secteur A", "Exploitation Test", "000111");
    const lines = csv.split(/\r?\n/);
    const headers = lines[0].split(";");
    expect(headers[0]).toBe("Secteur");
    expect(headers[3]).toBe("Parcelles");
    expect(headers[7]).toBe("CultureN");
    expect(headers[12]).toBe("Geometrie");
  });

  it("encode correctement les valeurs avec point-virgule", async () => {
    const features = [
      {
        type: "Feature",
        properties: { nom: "Parcelle; test", surface_parcelle: 1.0, cultureN: "BTH" },
        geometry: {
          type: "Polygon",
          coordinates: [[[1.35, 44.01], [1.36, 44.01], [1.36, 44.02], [1.35, 44.01]]],
        },
      },
    ];
    const csv = await buildParcellesCsv(features, "", "", "");
    const dataLine = csv.split(/\r?\n/)[1];
    expect(dataLine).toContain('"Parcelle; test"');
  });

  it("round-trip: parseParcellesCsvToFeatures ∘ buildParcellesCsv conserve les données", async () => {
    const originalFeatures = await parseParcellesCsvToFeatures(makeFile(SEBASTIEN_CSV_TEXT));
    const csv = await buildParcellesCsv(originalFeatures, "", "", "");
    const reparsed = await parseParcellesCsvToFeatures(makeFile(csv));
    expect(reparsed).toHaveLength(originalFeatures.length);
    reparsed.forEach((f, i) => {
      expect(f.properties.nom).toBe(originalFeatures[i].properties.nom ?? originalFeatures[i].properties.nom_affiche);
    });
  });
});

describe("buildParcellesCsv — offset d'année de culture", () => {
  it("décale les cultures avec cultureYearOffset=1", async () => {
    const csv = `Secteur;Exploitation;Numero pacage;Parcelles;Surface parcelle;Parcelle Bio;Type de sol;CultureN;CultureN1;CultureN2;CultureN3;CultureN4;Geometrie
A;Test;000;P1;1;Non;;BTH;MIS;;;;1.35,44.01 1.36,44.01 1.36,44.02 1.35,44.02 1.35,44.01
`;
    const features = await parseParcellesCsvToFeatures(makeFile(csv), { cultureYearOffset: 1 });
    // Avec offset=1, BTH devient cultureN_1 et MIS devient cultureN_2
    expect(features[0].properties.cultureN_1).toBeTruthy();
    expect(features[0].properties.cultureN_2).toBeTruthy();
    expect(features[0].properties.cultureN).toBeUndefined();
  });
});
