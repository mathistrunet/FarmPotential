// src/services/telepacXml.js
import { toWgs84 } from "../utils/proj";
import { ringToGml, ringAreaM2 } from "../utils/geometry";

function normalizeNumero(value) {
  return value == null ? "" : String(value).trim();
}

function getFirstOuterRing(feature) {
  if (!feature || !feature.geometry) return null;
  const { type, coordinates } = feature.geometry;
  if (!coordinates) return null;
  if (type === "Polygon") return coordinates[0] || null;
  if (type === "MultiPolygon") return coordinates[0]?.[0] || null;
  return null;
}

function getAllOuterRings(feature) {
  if (!feature || !feature.geometry) return [];
  const { type, coordinates } = feature.geometry;
  if (!coordinates) return [];
  if (type === "Polygon") return coordinates[0] ? [coordinates[0]] : [];
  if (type === "MultiPolygon")
    return coordinates
      .map((poly) => poly?.[0])
      .filter((ring) => Array.isArray(ring) && ring.length > 0);
  return [];
}

export function buildTelepacXML(features) {
  const NS = "urn:x-telepac:fr.gouv.agriculture.telepac:echange-producteur";
  const GML = "http://www.opengis.net/gml";
  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  if (!Array.isArray(features) || features.length === 0) {
    return `<?xml version="1.0" encoding="ISO-8859-1"?>\n<producteurs xmlns="${NS}" xmlns:gml="${GML}"><producteur><demandeur certificat-environnemental="false" dossier-sans-demande-aides="false"></demandeur><rpg></rpg></producteur></producteurs>`;
  }

  const usedIlotNumbers = new Set();
  features.forEach((feature) => {
    const ilotNumero = normalizeNumero(feature?.properties?.ilot_numero);
    if (ilotNumero) usedIlotNumbers.add(ilotNumero);
  });

  let nextAutoIlot = 1;
  const allocateIlotNumero = () => {
    while (usedIlotNumbers.has(String(nextAutoIlot))) nextAutoIlot += 1;
    const numero = String(nextAutoIlot);
    usedIlotNumbers.add(numero);
    nextAutoIlot += 1;
    return numero;
  };

  const ilotMap = new Map();
  const orderedIlots = [];

  features.forEach((feature, index) => {
    if (!feature || !feature.geometry) return;
    const props = feature.properties || {};
    let ilotNumero = normalizeNumero(props.ilot_numero);
    if (!ilotNumero) ilotNumero = allocateIlotNumero();

    let ilot = ilotMap.get(ilotNumero);
    if (!ilot) {
      ilot = { numero: ilotNumero, parcelles: [], nextAutoNumero: 1 };
      ilotMap.set(ilotNumero, ilot);
      orderedIlots.push(ilot);
    }

    let numeroParcelle = normalizeNumero(props.numero);
    if (!numeroParcelle) {
      numeroParcelle = String(ilot.nextAutoNumero);
      ilot.nextAutoNumero += 1;
    } else {
      const parsed = parseInt(numeroParcelle, 10);
      if (!Number.isNaN(parsed)) {
        ilot.nextAutoNumero = Math.max(ilot.nextAutoNumero, parsed + 1);
      }
    }

    ilot.parcelles.push({ feature, numero: numeroParcelle, index });
  });

  let xml = `<?xml version="1.0" encoding="ISO-8859-1"?>\n`;
  xml += `<producteurs xmlns="${NS}" xmlns:gml="${GML}">`;
  xml += `<producteur>`;
  xml += `<demandeur certificat-environnemental="false" dossier-sans-demande-aides="false"></demandeur>`;
  xml += `<rpg>`;

  const pad = 0.002; // ~200 m

  orderedIlots.forEach((ilot) => {
    if (!ilot.parcelles.length) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasCoords = false;

    ilot.parcelles.forEach(({ feature }) => {
      const rings = getAllOuterRings(feature);
      rings.forEach((ring) => {
        ring.forEach(([lon, lat]) => {
          if (typeof lon !== "number" || typeof lat !== "number") return;
          hasCoords = true;
          minX = Math.min(minX, lon);
          minY = Math.min(minY, lat);
          maxX = Math.max(maxX, lon);
          maxY = Math.max(maxY, lat);
        });
      });
    });

    let ilotCoords = "";
    if (hasCoords) {
      ilotCoords = [
        [minX - pad, minY - pad],
        [maxX + pad, minY - pad],
        [maxX + pad, maxY + pad],
        [minX - pad, maxY + pad],
        [minX - pad, minY - pad],
      ]
        .map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`)
        .join(" ");
    }

    xml += `<ilot numero-ilot="${esc(ilot.numero)}">`;
    xml += `<geometrie><gml:Polygon><gml:outerBoundaryIs><gml:LinearRing><gml:coordinates>${ilotCoords}</gml:coordinates></gml:LinearRing></gml:outerBoundaryIs></gml:Polygon></geometrie>`;
    xml += `<parcelles>`;

    ilot.parcelles
      .sort((a, b) => a.index - b.index)
      .forEach(({ feature, numero }) => {
        const props = feature.properties || {};
        const code = normalizeNumero(props.code) || "JAC"; // Mets automatiquement le code culture JAC quand on exporte une parcelle sans code culture
        const ring = getFirstOuterRing(feature);
        const gmlCoords = ring ? ringToGml(ring) : "";
        const ares = ring ? Math.round(ringAreaM2(ring) / 100) : 0; //surface arrondie et transformée en ares

        xml += `<parcelle>`;
        xml += `<descriptif-parcelle numero-parcelle="${esc(numero)}">`;
        xml += `<culture-principale>`;
        xml += `<code-culture>${esc(code)}</code-culture>`;
        xml += `</culture-principale>`;
        xml += `</descriptif-parcelle>`;
        xml += `<geometrie><gml:Polygon><gml:outerBoundaryIs><gml:LinearRing><gml:coordinates>${gmlCoords}</gml:coordinates></gml:LinearRing></gml:outerBoundaryIs></gml:Polygon></geometrie>`;
        xml += `<surface-admissible>${ares}</surface-admissible>`;
        xml += `</parcelle>`;
      });

    xml += `</parcelles></ilot>`;
  });

  xml += `</rpg></producteur></producteurs>`;
  return xml;
}


export async function parseTelepacXmlToFeatures(file) {
  const text = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(r.result);
    r.readAsText(file, "ISO-8859-1");
  });

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

    // 🔹 Récupération de l'îlot parent
    const parcellesNode = p.parentNode; // <parcelles>
    const ilotNode = parcellesNode && parcellesNode.parentNode; // <ilot>
    const ilot_numero =
      (ilotNode &&
        ilotNode.getAttribute &&
        ilotNode.getAttribute("numero-ilot")) ||
      "";

    // Variables
    let numero = "";
    let code = "";

    // Lecture du descriptif de parcelle
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

    // Surface admissible
    let surfaceA;
    const surfNode = p.getElementsByTagName("surface-admissible")[0];
    if (surfNode) {
      const val = parseFloat(surfNode.textContent);
      if (!isNaN(val)) surfaceA = val;
    }

    // Lecture des coordonnées GML -> WGS84
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

    // 🔹 Construction du nom à afficher façon Assolia (ilot-parcelle)
    const nom_affiche =
      ilot_numero && numero ? `${ilot_numero}-${numero}` : numero;

    // Ajout de la feature
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
