// src/services/telepacXml.js
import { toWgs84 } from "../utils/proj";
import { ringToGml, ringAreaM2 } from "../utils/geometry";
import { telepacMesParcellesImporter } from "../lib/importers";

let autoNumero = 1;

export function buildTelepacXML(features) {
  const NS = "urn:x-telepac:fr.gouv.agriculture.telepac:echange-producteur";
  const GML = "http://www.opengis.net/gml";
  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // Ilot englobant (approx en WGS84 pour simplicité)
  const first = features[0];
  const ring0 = first.geometry.coordinates[0];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  ring0.forEach(([lon, lat]) => {
    minX = Math.min(minX, lon);
    minY = Math.min(minY, lat);
    maxX = Math.max(maxX, lon);
    maxY = Math.max(maxY, lat);
  });
  const pad = 0.002; // ~200 m
  const ilotCoords = [
    [minX - pad, minY - pad],
    [maxX + pad, minY - pad],
    [maxX + pad, maxY + pad],
    [minX - pad, maxY + pad],
    [minX - pad, minY - pad],
  ]
    .map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`)
    .join(" ");
  const numeroIlot =
    (features[0]?.properties?.ilot_numero ?? "1").toString().trim() || "1";

  let xml = `<?xml version="1.0" encoding="ISO-8859-1"?>\n`;
  xml += `<producteurs xmlns="${NS}" xmlns:gml="${GML}">`;
  xml += `<producteur>`;
  xml += `<demandeur certificat-environnemental="false" dossier-sans-demande-aides="false"></demandeur>`;
  xml += `<rpg>`;
  xml += `<ilot numero-ilot="${numeroIlot}">`;
  xml += `<geometrie><gml:Polygon><gml:outerBoundaryIs><gml:LinearRing><gml:coordinates>${ilotCoords}</gml:coordinates></gml:LinearRing></gml:outerBoundaryIs></gml:Polygon></geometrie>`;
  xml += `<parcelles>`;

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const props = f.properties || {};
    let numero = 0
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const props = f.properties || {}; 
      const rawNumero = (props.numero ?? "").toString().trim();
      numero = rawNumero !== "" ? rawNumero : String(autoNumero++);
    }
    const code = (props.code || "").trim() || "JAC"; // Mets automatiquement le code culture JAC quand on exporte une parcelle sans code culture
    const gmlCoords = ringToGml(f.geometry.coordinates[0]);
    const ares = Math.round(ringAreaM2(f.geometry.coordinates[0]) / 100); //surface arrondie et transformée en ares

    xml += `<parcelle>`;
    xml += `<descriptif-parcelle numero-parcelle="${esc(numero)}">`;
    xml += `<culture-principale>`;
    xml += `<code-culture>${esc(code)}</code-culture>`;
    xml += `</culture-principale>`;
    xml += `</descriptif-parcelle>`;
    xml += `<geometrie><gml:Polygon><gml:outerBoundaryIs><gml:LinearRing><gml:coordinates>${gmlCoords}</gml:coordinates></gml:LinearRing></gml:outerBoundaryIs></gml:Polygon></geometrie>`;
    xml += `<surface-admissible>${ares}</surface-admissible>`;
    xml += `</parcelle>`;
  }

  xml += `</parcelles></ilot></rpg></producteur></producteurs>`;
  return xml;
}

function normalisePropertiesFromMesParcelles(feature) {
  const properties = { ...(feature?.properties || {}) };
  const ilotNumero = properties.ilot ?? properties.ilot_numero ?? null;
  const parcelleNumero = properties.parcelle ?? properties.numero ?? null;
  const code = properties.code ?? properties.code_culture ?? null;

  if (properties.source == null) {
    properties.source = "telepac-mesparcelles-xml";
  }
  if (ilotNumero != null && properties.ilot_numero == null) {
    properties.ilot_numero = ilotNumero;
  }
  if (parcelleNumero != null && properties.numero == null) {
    properties.numero = parcelleNumero;
  }
  if (code != null && properties.code == null) {
    properties.code = code;
  }

  if (ilotNumero != null || parcelleNumero != null) {
    const label =
      ilotNumero != null && parcelleNumero != null
        ? `${ilotNumero}-${parcelleNumero}`
        : `${parcelleNumero ?? ilotNumero}`;
    if (label) {
      properties.nom_affiche = label;
    }
  }

  return properties;
}

function normaliseMesParcellesFeatures(collection) {
  const out = [];
  if (!collection?.features) return out;

  for (const feature of collection.features) {
    if (!feature || !feature.geometry) continue;

    const baseProps = normalisePropertiesFromMesParcelles(feature);
    if (feature.geometry.type === "Polygon") {
      out.push({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: feature.geometry.coordinates,
        },
        properties: baseProps,
      });
      continue;
    }

    if (feature.geometry.type === "MultiPolygon") {
      feature.geometry.coordinates.forEach((coords, index) => {
        out.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: coords },
          properties: { ...baseProps, _multipolygon_index: index },
        });
      });
      continue;
    }

    console.warn(
      "TELEPAC_XML: Unsupported geometry from Mes Parcelles importer",
      feature.geometry?.type
    );
  }

  return out;
}

function parseLegacyTelepacXml(text) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "application/xml");
  const isError = xml.getElementsByTagName("parsererror").length > 0;
  if (isError) throw new Error("XML invalide");
  const NS = "urn:x-telepac:fr.gouv.agriculture.telepac:echange-producteur";
  const GML = "http://www.opengis.net/gml";

  const parcelles = xml.getElementsByTagNameNS
    ? xml.getElementsByTagNameNS(NS, "parcelle")
    : xml.querySelectorAll("parcelle");

  const features = [];
  for (let i = 0; i < parcelles.length; i++) {
    const p = parcelles[i];

    const parcellesNode = p.parentNode;
    const ilotNode = parcellesNode && parcellesNode.parentNode;
    const ilot_numero =
      (ilotNode &&
        ilotNode.getAttribute &&
        ilotNode.getAttribute("numero-ilot")) ||
      "";

    let numero = "";
    let code = "";

    const desc = p.getElementsByTagName("descriptif-parcelle")[0];
    if (desc) {
      const numAttr = desc.getAttribute("numero-parcelle");
      if (numAttr) numero = numAttr.trim();
      const cp = desc.getElementsByTagName("culture-principale")[0];
      if (cp) {
        const codeNode = cp.getElementsByTagName("code-culture")[0];
        if (codeNode) code = codeNode.textContent.trim().toUpperCase();
      }
    }

    let surfaceA;
    const surfNode = p.getElementsByTagName("surface-admissible")[0];
    if (surfNode) {
      const val = parseFloat(surfNode.textContent);
      if (!isNaN(val)) surfaceA = val;
    }

    const ringWgs = [];
    const coordNode = p.getElementsByTagNameNS
      ? p.getElementsByTagNameNS(GML, "coordinates")[0]
      : p.getElementsByTagName("coordinates")[0];
    if (coordNode && coordNode.textContent) {
      const pairs = coordNode.textContent.trim().split(/\s+/);
      for (const pair of pairs) {
        const [xStr, yStr] = pair.split(",");
        if (xStr && yStr) {
          const [lon, lat] = toWgs84([parseFloat(xStr), parseFloat(yStr)]);
          ringWgs.push([lon, lat]);
        }
      }
    }

    const nom_affiche =
      ilot_numero && numero ? `${ilot_numero}-${numero}` : numero;

    features.push({
      type: "Feature",
      properties: {
        numero,
        code,
        ilot_numero,
        nom_affiche,
        ...(surfaceA !== undefined ? { surface_admissible: surfaceA } : {}),
      },
      geometry: { type: "Polygon", coordinates: [ringWgs] },
    });
  }

  return features;
}

export async function parseTelepacXmlToFeatures(file) {
  let arrayBuffer;
  if (file?.arrayBuffer) {
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch (err) {
      console.warn("TELEPAC_XML: Failed to read arrayBuffer, falling back to FileReader", err);
    }
  }

  if (!arrayBuffer) {
    arrayBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result);
      reader.readAsArrayBuffer(file);
    });
  }

  try {
    const mesParcelles = await telepacMesParcellesImporter.read(arrayBuffer);
    const mesParcellesFeatures = normaliseMesParcellesFeatures(mesParcelles);
    if (mesParcellesFeatures.length > 0) {
      return mesParcellesFeatures;
    }
  } catch (err) {
    console.warn("TELEPAC_XML: Mes Parcelles importer failed, falling back to legacy parser", err);
  }

  let text;
  try {
    text = new TextDecoder("iso-8859-1").decode(arrayBuffer);
  } catch (err) {
    console.warn("TELEPAC_XML: ISO-8859-1 TextDecoder unavailable, using FileReader", err);
    text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result);
      reader.readAsText(file, "ISO-8859-1");
    });
  }

  const legacyFeatures = parseLegacyTelepacXml(text);
  if (!legacyFeatures.length) {
    throw new Error("TELEPAC_XML: structure invalide (aucun ilot/parcelle)");
  }
  return legacyFeatures;
}
