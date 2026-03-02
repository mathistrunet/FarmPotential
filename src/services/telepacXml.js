// src/services/telepacXml.js
import { toLambert93, toWgs84 } from "../utils/proj";
import { ringToGml, ringAreaM2 } from "../utils/geometry";

function normalizeNumero(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeDigits(value) {
  return normalizeNumero(value).replace(/\D/g, "");
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stableIlotReference(pacage, ilotNumero) {
  const source = `${pacage}|Courante|${ilotNumero}`;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  const prefix = normalizeDigits(pacage).slice(0, 9).padEnd(9, "0");
  const suffix = String(hash % 1000).padStart(3, "0");
  return `${prefix}${suffix}`;
}

function normalizeIlotReference(value, pacage, ilotNumero) {
  const digits = normalizeDigits(value);
  if (digits.length >= 12) return digits.slice(0, 12);
  if (digits.length > 0) return digits.padStart(12, "0");
  return stableIlotReference(pacage, ilotNumero);
}

function firstProperty(properties, keys) {
  for (const key of keys) {
    const value = normalizeNumero(properties?.[key]);
    if (value) return value;
  }
  return "";
}

function inferProducerMeta(features) {
  let pacage = "";
  let siret = "";
  let exploitation = "";
  let email = "";
  let commune = "";

  features.forEach((feature) => {
    const props = feature?.properties || {};
    if (!pacage) {
      pacage = normalizeDigits(
        firstProperty(props, ["numero_pacage", "numero-pacage", "pacage", "code_exploitation", "codeExploitation"])
      );
    }
    if (!siret) {
      siret = normalizeDigits(firstProperty(props, ["siret", "SIRET"]));
    }
    if (!exploitation) {
      exploitation = firstProperty(props, ["exploitation", "nom_exploitation", "raison_sociale", "structureName"]);
    }
    if (!email) {
      email = firstProperty(props, ["courriel", "email", "mail"]);
    }
    if (!commune) {
      commune = normalizeDigits(firstProperty(props, ["code_insee", "commune", "insee", "codeCommune"]));
    }
  });

  return {
    pacage: (pacage || "000000000").slice(0, 9),
    siret: (siret || "00000000000000").slice(0, 14),
    exploitation: exploitation || "Exploitation",
    email,
    communeSiege: (commune || "00000").slice(0, 5),
  };
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

function readCultureCodeFromProperty(props, cultureColumn) {
  if (!cultureColumn) return normalizeNumero(props.code);
  const rawValue = normalizeNumero(props?.[cultureColumn]);
  return rawValue ? rawValue.toUpperCase() : "";
}

export function buildTelepacXML(features, options = {}) {
  const NS = "urn:x-telepac:fr.gouv.agriculture.telepac:echange-producteur";
  const GML = "http://www.opengis.net/gml";
  const esc = (s) => xmlEscape(s);
  const cultureColumn = normalizeNumero(options.cultureColumn);

  const meta = inferProducerMeta(Array.isArray(features) ? features : []);

  if (!Array.isArray(features) || features.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<producteurs xmlns="${NS}" xmlns:gml="${GML}">\n  <producteur numero-pacage="${meta.pacage}" campagne="Courante" fichier-xsd="Echanges-producteur-export-2025-V1">\n    <demandeur certificat-environnemental="false" dossier-sans-demande-aides="false">\n      <identification-societe>\n        <exploitation>${esc(meta.exploitation)}</exploitation>\n      </identification-societe>\n      <siret>${meta.siret}</siret>\n${meta.email ? `      <courriel>${esc(meta.email)}</courriel>\n` : ""}    </demandeur>\n    <rpg></rpg>\n  </producteur>\n</producteurs>`;
  }

  const globalCommune =
    normalizeDigits(
      firstProperty(features[0]?.properties || {}, ["code_insee", "commune", "insee", "codeCommune"])
    ) || meta.communeSiege;

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

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<producteurs xmlns="${NS}" xmlns:gml="${GML}">\n`;
  xml += `  <producteur numero-pacage="${meta.pacage}" campagne="Courante" fichier-xsd="Echanges-producteur-export-2025-V1">\n`;
  xml += `    <demandeur certificat-environnemental="false" dossier-sans-demande-aides="false">\n`;
  xml += `      <identification-societe>\n`;
  xml += `        <exploitation>${esc(meta.exploitation)}</exploitation>\n`;
  xml += `      </identification-societe>\n`;
  xml += `      <siret>${meta.siret}</siret>\n`;
  if (meta.email) {
    xml += `      <courriel>${esc(meta.email)}</courriel>\n`;
  }
  xml += `    </demandeur>\n`;
  xml += `    <rpg>\n`;

  const ilotPad = 5; // 5 m

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
          const [x, y] = toLambert93([lon, lat]);
          hasCoords = true;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        });
      });
    });

    let ilotCoords = "";
    if (hasCoords) {
      ilotCoords = [
        [minX - ilotPad, minY - ilotPad],
        [maxX + ilotPad, minY - ilotPad],
        [maxX + ilotPad, maxY + ilotPad],
        [minX - ilotPad, maxY + ilotPad],
        [minX - ilotPad, minY - ilotPad],
      ]
        .map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`)
        .join(" ");
    }

    const rawIlotReference = firstProperty(ilot.parcelles[0]?.feature?.properties || {}, [
      "numero_ilot_reference",
      "numero-ilot-reference",
      "ilot_reference",
    ]);
    const ilotReference = normalizeIlotReference(rawIlotReference, meta.pacage, ilot.numero);
    const codeCommune = (globalCommune || "00000").slice(0, 5);

    xml += `      <ilot numero-ilot-reference="${esc(ilotReference)}" numero-ilot="${esc(ilot.numero)}">\n`;
    xml += `        <commune>${esc(codeCommune)}</commune>\n`;
    xml += `        <geometrie><gml:Polygon><gml:outerBoundaryIs><gml:LinearRing><gml:coordinates>${ilotCoords}</gml:coordinates></gml:LinearRing></gml:outerBoundaryIs></gml:Polygon></geometrie>\n`;
    xml += `        <parcelles>\n`;

    ilot.parcelles
      .sort((a, b) => a.index - b.index)
      .forEach(({ feature, numero }) => {
        const props = feature.properties || {};
        const code = readCultureCodeFromProperty(props, cultureColumn) || normalizeNumero(props.code) || "JAC";
        const ring = getFirstOuterRing(feature);
        const gmlCoords = ring ? ringToGml(ring) : "";
        const ares = ring ? Math.round(ringAreaM2(ring) / 100) : 0; //surface arrondie et transformée en ares

        xml += `          <parcelle>\n`;
        xml += `            <descriptif-parcelle numero-parcelle="${esc(numero)}">\n`;
        xml += `              <culture-principale production-semences="false" production-fermiers="false" deshydratation="false" derogation-ukraine="false" culture-secondaire="A00" accident-culture="false">\n`;
        xml += `                <code-culture>${esc(code)}</code-culture>\n`;
        xml += `                <reconversion-pp>false</reconversion-pp>\n`;
        xml += `                <retournement-pp>false</retournement-pp>\n`;
        xml += `              </culture-principale>\n`;
        xml += `              <engagements-maec elevage-monogastrique="false"/>\n`;
        xml += `            </descriptif-parcelle>\n`;
        xml += `            <geometrie><gml:Polygon><gml:outerBoundaryIs><gml:LinearRing><gml:coordinates>${gmlCoords}</gml:coordinates></gml:LinearRing></gml:outerBoundaryIs></gml:Polygon></geometrie>\n`;
        xml += `            <surface-admissible>${ares}</surface-admissible>\n`;
        xml += `          </parcelle>\n`;
      });

    xml += `        </parcelles>\n`;
    xml += `      </ilot>\n`;
  });

  xml += `    </rpg>\n`;
  xml += `  </producteur>\n`;
  xml += `</producteurs>`;
  return xml;
}


function buildTelepacCultureProps(code, offset) {
  if (!code) return {};
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
  if (safeOffset === 0) {
    return { cultureN: code, code };
  }
  return { [`cultureN_${safeOffset}`]: code };
}

export async function parseTelepacXmlToFeatures(file, options = {}) {
  const cultureYearOffset = Number.isFinite(options.cultureYearOffset)
    ? options.cultureYearOffset
    : 0;
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
  const producteurs = xml.getElementsByTagNameNS
    ? xml.getElementsByTagNameNS(NS, "producteur")
    : xml.getElementsByTagName("producteur");
  const producteurNode = producteurs?.[0] || null;
  const pacage =
    (producteurNode &&
      producteurNode.getAttribute &&
      producteurNode.getAttribute("numero-pacage")) ||
    "";

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
    const cultureProps = buildTelepacCultureProps(code, cultureYearOffset);

    features.push({
      type: "Feature",
      properties: {
        numero,
        ilot_numero,
        nom_affiche,
        ...cultureProps,
        ...(pacage ? { code_exploitation: pacage } : {}),
        ...(surfaceA !== undefined ? { surface_admissible: surfaceA } : {}),
      },
      geometry: { type: "Polygon", coordinates: [ringWgs] },
    });
  }
  return features;
}
