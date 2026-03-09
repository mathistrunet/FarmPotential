// src/services/parcellesCsv.js
import { parse } from "csv-parse/browser/esm/sync";
import { featureAreaHa } from "../utils/geometry";
import {
  codeFromLabel,
  detectCultureCode,
  displayLabelFromProps,
  labelFromCode,
} from "../utils/cultureLabels";
import { buildError, ERROR_CODES } from "../utils/errors";
import { withBasePath } from "../utils/publicBase";

const CSV_HEADERS = [
  "Secteur",
  "Exploitation",
  "Numero pacage",
  "Parcelles",
  "Surface parcelle",
  "Parcelle Bio",
  "Type de sol",
  "CultureN",
  "CultureN1",
  "CultureN2",
  "CultureN3",
  "CultureN4",
  "Geometrie",
];

const ASSOLIA_CULTURES_PATH = withBasePath("/data/assolia_cultures_export.csv");
let assoliaCulturesPromise;

function escapeCsvCell(value) {
  const str = value == null ? "" : String(value);
  if (/[";\t\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function normalizeHeaderKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function getFirstOuterRing(feature) {
  if (!feature?.geometry) return null;
  const { type, coordinates } = feature.geometry;
  if (type === "Polygon") return coordinates?.[0] || null;
  if (type === "MultiPolygon") return coordinates?.[0]?.[0] || null;
  return null;
}

function formatNumber(value, decimals = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.?0+$/, "");
}

function formatCoord(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  const fixed = value.toFixed(12);
  return fixed.replace(/\.?0+$/, "");
}

function formatCultureValue(raw) {
  if (raw == null) return "";
  const value = String(raw).trim();
  if (!value) return "";
  return labelFromCode(value) || value;
}

function normalizeStructureName(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function getMetacodeFromValue(raw) {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const fromLabel = codeFromLabel(trimmed);
  if (fromLabel) return String(fromLabel).trim().toUpperCase();
  const upper = trimmed.toUpperCase();
  if (labelFromCode(upper)) return upper;
  if (/^[A-Z0-9]{2,10}$/.test(upper)) return upper;
  return "";
}

async function loadAssoliaCulturesExport() {
  if (!assoliaCulturesPromise) {
    assoliaCulturesPromise = fetch(ASSOLIA_CULTURES_PATH)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Chargement du référentiel cultures impossible.");
        }
        return response.text();
      })
      .then((text) =>
        parse(text, {
          columns: true,
          delimiter: ";",
          relax_quotes: true,
          skip_empty_lines: true,
          bom: true,
          trim: true,
        })
      );
  }
  return assoliaCulturesPromise;
}

async function getStructureCultureLookup(structureName) {
  const normalizedStructure = normalizeStructureName(structureName);
  if (!normalizedStructure) return null;
  const entries = await loadAssoliaCulturesExport();
  const byMetacode = {};
  const byCultureName = {};
  let fallbackName = "";
  entries.forEach((entry) => {
    const structure = normalizeStructureName(entry.structure_name);
    if (structure !== normalizedStructure) return;
    const metacode = String(entry.metacode || "").trim().toUpperCase();
    const name = String(entry.culture_name || "").trim();
    if (!name) return;
    const normalizedName = normalizeStructureName(name);
    if (metacode && normalizedName && !byCultureName[normalizedName]) {
      byCultureName[normalizedName] = metacode;
    }
    if (metacode) {
      byMetacode[metacode] = name;
    } else if (!fallbackName) {
      fallbackName = name;
    }
  });
  if (!Object.keys(byMetacode).length && !Object.keys(byCultureName).length && !fallbackName) {
    return null;
  }
  return { byMetacode, byCultureName, fallbackName };
}

function buildCultureProps(cultureValues, offset) {
  const props = {};
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
  cultureValues.forEach((entry, index) => {
    if (!entry?.value && !entry?.code) return;
    const targetIndex = index + safeOffset;
    const key = targetIndex === 0 ? "cultureN" : `cultureN_${targetIndex}`;
    if (entry.value) props[key] = entry.value;
    if (entry.code && targetIndex === 0) props.code = entry.code;
  });
  return props;
}

function formatParcelleBioValue(raw) {
  if (raw == null || String(raw).trim() === "") {
    return "Non";
  }
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "oui", "yes", "y"].includes(normalized)) {
    return "Oui";
  }
  if (["0", "false", "non", "no", "n"].includes(normalized)) {
    return "Non";
  }
  return String(raw);
}

function parseCultureValue(raw, structureLookup = null) {
  const trimmed = raw == null ? "" : String(raw).trim();
  if (!trimmed) return { value: "", code: "" };
  const structureCode = structureLookup?.byCultureName?.[normalizeStructureName(trimmed)];
  if (structureCode) return { value: structureCode, code: structureCode };
  const fromLabel = codeFromLabel(trimmed);
  if (fromLabel) return { value: fromLabel, code: fromLabel };
  const upper = trimmed.toUpperCase();
  if (labelFromCode(upper)) return { value: upper, code: upper };
  if (/^[A-Za-z0-9]{2,10}$/.test(trimmed)) return { value: upper, code: upper };
  return { value: trimmed, code: "" };
}

function parseSurfaceValue(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).trim().replace(",", ".");
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseGeometry(raw) {
  const text = raw == null ? "" : String(raw).trim();
  if (!text) return null;
  const ring = [];
  const pairs = text.split(/\s+/);
  for (const pair of pairs) {
    const [lonStr, latStr] = pair.split(",");
    if (!lonStr || !latStr) continue;
    const lon = parseFloat(lonStr);
    const lat = parseFloat(latStr);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    ring.push([lon, lat]);
  }
  if (ring.length < 3) return null;
  const [firstLon, firstLat] = ring[0];
  const [lastLon, lastLat] = ring[ring.length - 1];
  if (firstLon !== lastLon || firstLat !== lastLat) {
    ring.push([firstLon, firstLat]);
  }
  return ring;
}

function formatGeometry(feature) {
  const ring = getFirstOuterRing(feature);
  if (!Array.isArray(ring) || !ring.length) return "";
  return ring
    .map(([lon, lat]) => `${formatCoord(lon)},${formatCoord(lat)}`)
    .join(" ");
}

function normalizeRowMap(row) {
  const map = new Map();
  Object.entries(row).forEach(([key, value]) => {
    map.set(normalizeHeaderKey(key), value);
  });
  return map;
}

export async function buildParcellesCsv(
  features,
  secteur,
  exploitation,
  codeExploitation,
  options = {}
) {
  let structureLookup = null;
  if (options.structureName) {
    try {
      structureLookup = await getStructureCultureLookup(options.structureName);
    } catch (error) {
      console.warn(error);
    }
  }
  const resolveCulture = (raw, metacodeOverride = "") => {
    const value = raw == null ? "" : String(raw).trim();
    if (!value && !metacodeOverride) return "";
    const metacode = metacodeOverride || getMetacodeFromValue(value);
    if (structureLookup?.byMetacode?.[metacode]) {
      return structureLookup.byMetacode[metacode];
    }
    if (structureLookup?.fallbackName) {
      return structureLookup.fallbackName;
    }
    return formatCultureValue(value);
  };

  const rows = (features || []).map((feature, idx) => {
    const props = feature?.properties || {};
    const parcelleName =
      props.nom ??
      props.nom_affiche ??
      props.name ??
      `Parcelle ${idx + 1}`;
    const surfaceValue =
      parseSurfaceValue(props.surface_parcelle) ??
      parseSurfaceValue(props.surface) ??
      featureAreaHa(feature);
    const parcelleBio =
      props.parcelle_bio ??
      props.bio ??
      props.parcelleBio ??
      props.parcelle_bio_label;
    const typeSol =
      props.type_sol ?? props.typeSol ?? props.type_de_sol ?? props.sol ?? "";
    const cultureNValue = displayLabelFromProps(props);
    const cultureNCode = detectCultureCode(props) || getMetacodeFromValue(cultureNValue);
    const cultureNOutput = structureLookup
      ? resolveCulture(cultureNValue, cultureNCode)
      : cultureNValue;
    const cultureN1Value = props.cultureN1 ?? props.cultureN_1 ?? "";
    const cultureN2Value = props.cultureN2 ?? props.cultureN_2 ?? "";
    const cultureN3Value = props.cultureN3 ?? props.cultureN_3 ?? "";
    const cultureN4Value = props.cultureN4 ?? props.cultureN_4 ?? "";

    return [
      secteur || props.secteur || "",
      exploitation || props.exploitation || props.exploitations || "",
      codeExploitation || props.code_exploitation || props.codeExploitation || "",
      parcelleName,
      formatNumber(surfaceValue),
      formatParcelleBioValue(parcelleBio),
      typeSol == null ? "" : String(typeSol),
      cultureNOutput,
      structureLookup
        ? resolveCulture(cultureN1Value)
        : formatCultureValue(cultureN1Value),
      structureLookup
        ? resolveCulture(cultureN2Value)
        : formatCultureValue(cultureN2Value),
      structureLookup
        ? resolveCulture(cultureN3Value)
        : formatCultureValue(cultureN3Value),
      structureLookup
        ? resolveCulture(cultureN4Value)
        : formatCultureValue(cultureN4Value),
      formatGeometry(feature),
    ];
  });

  return [CSV_HEADERS, ...rows]
    .map((row) => row.map(escapeCsvCell).join(";"))
    .join("\r\n");
}

export async function parseParcellesCsvToFeatures(file, options = {}) {
  const cultureYearOffset = Number.isFinite(options.cultureYearOffset)
    ? options.cultureYearOffset
    : 0;
  let structureLookup = null;
  if (options.structureName) {
    try {
      structureLookup = await getStructureCultureLookup(options.structureName);
    } catch (error) {
      console.warn(error);
    }
  }
  const text = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(r.result);
    r.readAsText(file, "utf-8");
  });

  let rows = [];
  try {
    rows = parse(text, {
      columns: true,
      delimiter: [";", "\t"],
      relax_quotes: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });
  } catch (error) {
    throw buildError(
      ERROR_CODES.CSV_PARSE_FAILED,
      "Impossible d'analyser le fichier CSV.",
      error
    );
  }

  const features = [];
  for (const row of rows) {
    const map = normalizeRowMap(row);
    const secteur = map.get("secteur") ?? "";
    const exploitation =
      map.get("exploitations") ?? map.get("exploitation") ?? "";
    const codeExploitation =
      map.get("codeexploitation") ?? map.get("numeropacage") ?? "";
    const parcelles = map.get("parcelles") ?? "";
    const surfaceParcelle = parseSurfaceValue(map.get("surfaceparcelle"));
    const parcelleBio = map.get("parcellebio") ?? "";
    const typeSol = map.get("typedsol") ?? map.get("typedesol") ?? "";
    const cultureN = parseCultureValue(map.get("culturen"), structureLookup);
    const cultureN1 = parseCultureValue(map.get("culturen1"), structureLookup);
    const cultureN2 = parseCultureValue(map.get("culturen2"), structureLookup);
    const cultureN3 = parseCultureValue(map.get("culturen3"), structureLookup);
    const cultureN4 = parseCultureValue(map.get("culturen4"), structureLookup);
    const ring = parseGeometry(map.get("geometrie"));
    if (!ring) continue;

    const cultureProps = buildCultureProps(
      [cultureN, cultureN1, cultureN2, cultureN3, cultureN4],
      cultureYearOffset
    );

    const properties = {
      ...(secteur ? { secteur } : {}),
      ...(exploitation ? { exploitation } : {}),
      ...(codeExploitation ? { code_exploitation: codeExploitation } : {}),
      ...(parcelles ? { nom: parcelles, nom_affiche: parcelles } : {}),
      ...(surfaceParcelle != null ? { surface_parcelle: surfaceParcelle } : {}),
      ...(parcelleBio ? { parcelle_bio: parcelleBio } : {}),
      ...(typeSol ? { type_sol: typeSol } : {}),
      ...cultureProps,
    };

    features.push({
      type: "Feature",
      properties,
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  }

  return features;
}
