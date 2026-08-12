// @vitest-environment jsdom
//
// Chaque format annoncé sur l'écran d'accueil traverse-t-il réellement l'import ?
// Le point d'entrée testé est celui qu'appelle le bouton « Importer », pas les
// analyseurs pris un à un : c'est la chaîne complète qui doit tenir.
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseParcellaireFileToFeatures, IMPORT_FORMATS } from "./parcellaireImport.js";
import { createShapefileZip } from "./shapefileWriter.js";

/** jsdom n'implémente pas File#arrayBuffer ni File#text ; les navigateurs, si. */
const fichier = (contenu, nom) => {
  const file = new File([contenu], nom, { type: "application/octet-stream" });
  if (typeof file.arrayBuffer !== "function") {
    const bytes =
      typeof contenu === "string"
        ? new TextEncoder().encode(contenu)
        : new Uint8Array(contenu instanceof Uint8Array ? contenu : new Uint8Array(contenu));
    file.arrayBuffer = async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    file.text = async () => new TextDecoder().decode(bytes);
  }
  return file;
};

const ANNEAU = [
  [1.35, 44.01],
  [1.36, 44.01],
  [1.36, 44.02],
  [1.35, 44.02],
  [1.35, 44.01],
];

const kmlAvecPolygone = () => {
  const coords = ANNEAU.map(([x, y]) => `${x},${y},0`).join(" ");
  return (
    '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
    `<Placemark><name>P1</name><Polygon><outerBoundaryIs><LinearRing>` +
    `<coordinates>${coords}</coordinates>` +
    "</LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>"
  );
};

const csvAvec = (entete, valeur) => {
  const cellule = `"${String(valeur).replace(/"/g, '""')}"`;
  return [`Parcelles;Surface parcelle;CultureN;${entete}`, `P1;1,23;BTH;${cellule}`].join("\n");
};

describe("parseParcellaireFileToFeatures — formats annoncés", () => {
  it("GeoJSON", async () => {
    const gj = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { nom_parcelle: "P1" },
          geometry: { type: "Polygon", coordinates: [ANNEAU] },
        },
      ],
    };
    const out = await parseParcellaireFileToFeatures(fichier(JSON.stringify(gj), "p.geojson"));
    expect(out).toHaveLength(1);
    expect(out[0].geometry.type).toBe("Polygon");
  });

  it("KML", async () => {
    const out = await parseParcellaireFileToFeatures(fichier(kmlAvecPolygone(), "p.kml"));
    expect(out).toHaveLength(1);
  });

  it("KMZ", async () => {
    const zip = new JSZip();
    zip.file("doc.kml", kmlAvecPolygone());
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const out = await parseParcellaireFileToFeatures(fichier(buffer, "p.kmz"));
    expect(out).toHaveLength(1);
  });

  it("Shapefile .zip", async () => {
    const buffer = await createShapefileZip({
      features: [
        {
          type: "Feature",
          properties: { NOM_PARCEL: "P1" },
          geometry: { type: "Polygon", coordinates: [ANNEAU] },
        },
      ],
      baseName: "parcelles",
      fields: [{ name: "NOM_PARCEL", type: "C", size: 60 }],
      prj:
        'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],' +
        'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',
    });
    const out = await parseParcellaireFileToFeatures(fichier(buffer, "p.zip"));
    expect(out.length).toBeGreaterThan(0);
  });

  it("XML Télépac, confié à l'analyseur dédié", async () => {
    let appele = false;
    const out = await parseParcellaireFileToFeatures(fichier("<xml/>", "p.xml"), {
      onTelepacXml: async () => {
        appele = true;
        return [
          { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ANNEAU] } },
        ];
      },
    });
    expect(appele).toBe(true);
    expect(out).toHaveLength(1);
  });

  it("XML Télépac refusé si l'analyseur n'est pas fourni", async () => {
    await expect(parseParcellaireFileToFeatures(fichier("<xml/>", "p.xml"))).rejects.toThrow();
  });
});

describe("parseParcellaireFileToFeatures — colonne de géométrie d'un CSV", () => {
  const paires = ANNEAU.map(([x, y]) => `${x},${y}`).join(" ");
  const wkt = `POLYGON((${ANNEAU.map(([x, y]) => `${x} ${y}`).join(", ")}))`;
  const geojson = JSON.stringify({ type: "Polygon", coordinates: [ANNEAU] });

  // L'accueil annonce « une colonne de géométrie (WKT / GeoJSON) ». Seul le
  // format Assolia natif était lu : un CSV venu d'un SIG s'importait sans erreur
  // et sans créer la moindre parcelle.
  it.each([
    ["Geometrie", paires, "format Assolia natif"],
    ["Geometrie", wkt, "WKT"],
    ["Geometrie", geojson, "GeoJSON"],
    ["geometry", paires, "colonne à l'anglaise"],
    ["WKT", wkt, "colonne nommée WKT"],
    ["the_geom", wkt, "colonne PostGIS"],
  ])("colonne %s en %s (%s)", async (entete, valeur) => {
    const out = await parseParcellaireFileToFeatures(fichier(csvAvec(entete, valeur), "p.csv"));
    expect(out).toHaveLength(1);
    expect(out[0].geometry.type).toBe("Polygon");
  });

  it("ignore une ligne dont la géométrie est inexploitable", async () => {
    const out = await parseParcellaireFileToFeatures(
      fichier(csvAvec("Geometrie", "sans coordonnées"), "p.csv")
    );
    expect(out).toHaveLength(0);
  });
});

describe("IMPORT_FORMATS", () => {
  it("annonce exactement les formats que l'import sait router", () => {
    // Le GeoPackage n'est pas exerçable ici : sql.js charge son binaire WebAssembly
    // par URL, résolue par Vite dans le navigateur mais pas sous Node.
    expect(IMPORT_FORMATS.map((format) => format.id)).toEqual([
      "telepac-xml",
      "shapefile-zip",
      "geojson",
      "kml",
      "gpkg",
      "csv",
    ]);
  });
});
