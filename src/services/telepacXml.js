// src/services/telepacXml.js
import { toLambert93, toWgs84 } from "../utils/proj";
import { ringToGml, ringAreaM2 } from "../utils/geometry";
import { telepacMesParcellesImporter } from "../lib/importers";

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

function isTruthyBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "oui";
  }
  return false;
}

export function buildTelepacXML(features) {
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
    const conduiteBioSource =
      props.isOrganic ?? props.conduite_bio ?? props.bio ?? props.BIO ?? null;
    const conduiteBio = isTruthyBoolean(conduiteBioSource);
    const organicTypeSource =
      props.organicType ?? props.type_conduite_bio ?? props["type-conduite-bio"] ?? null;
    const organicType = organicTypeSource ? String(organicTypeSource).trim() : "";

    xml += `<parcelle>`;
    xml += `<descriptif-parcelle numero-parcelle="${esc(numero)}">`;
    xml += `<culture-principale>`;
    xml += `<code-culture>${esc(code)}</code-culture>`;
    xml += `</culture-principale>`;
    if (conduiteBio) {
      const typeAttr = organicType || "AB";
      xml += `<agri-bio conduite-bio="true" type-conduite-bio="${esc(
        typeAttr
      )}" conduite-maraichage="false" />`;
    }
    xml += `</descriptif-parcelle>`;
    xml += `<geometrie><gml:Polygon><gml:outerBoundaryIs><gml:LinearRing><gml:coordinates>${gmlCoords}</gml:coordinates></gml:LinearRing></gml:outerBoundaryIs></gml:Polygon></geometrie>`;
    xml += `<surface-admissible>${ares}</surface-admissible>`;
    xml += `</parcelle>`;
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

  if (properties.conduite_bio != null && properties.isOrganic == null) {
    properties.isOrganic = properties.conduite_bio;
  }
  if (properties.organicType == null && properties.type_conduite_bio != null) {
    properties.organicType = properties.type_conduite_bio;
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

    const parcellesNode = p.parentNode;
    const ilotNode = parcellesNode && parcellesNode.parentNode;
    const ilot_numero =
      (ilotNode &&
        ilotNode.getAttribute &&
        ilotNode.getAttribute("numero-ilot")) ||
      "";

    let numero = "";
    let code = "";
    let conduiteBio;
    let hasConduiteBio = false;
    let organicType = null;

    const desc = p.getElementsByTagName("descriptif-parcelle")[0];
    if (desc) {
      const numAttr = desc.getAttribute("numero-parcelle");
      if (numAttr) numero = numAttr.trim();
      const cp = desc.getElementsByTagName("culture-principale")[0];
      if (cp) {
        const codeNode = cp.getElementsByTagName("code-culture")[0];
        if (codeNode) code = codeNode.textContent.trim().toUpperCase();
      }

      const agriBioNode = desc.getElementsByTagName("agri-bio")[0];
      if (agriBioNode) {
        const conduiteAttr = agriBioNode.getAttribute("conduite-bio");
        if (conduiteAttr != null) {
          hasConduiteBio = true;
          conduiteBio = isTruthyBoolean(conduiteAttr);
        }
        const typeAttr = agriBioNode.getAttribute("type-conduite-bio");
        if (typeAttr) {
          organicType = typeAttr.trim();
        }
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

    const feature = {
      type: "Feature",
      properties: {
        numero,
        ilot_numero,
        nom_affiche,
        ...cultureProps,
        ...(pacage ? { code_exploitation: pacage } : {}),
        ...(surfaceA !== undefined ? { surface_admissible: surfaceA } : {}),
        ...(hasConduiteBio ? { conduite_bio: conduiteBio, isOrganic: conduiteBio } : {}),
        ...(organicType ? { organicType } : {}),
      },
      geometry: { type: "Polygon", coordinates: [ringWgs] },
    };

    features.push(feature);
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
