// src/services/parcellesCsv.js
import { parse } from "csv-parse/browser/esm/sync";
import { featureAreaHa } from "../utils/geometry";
import {
  codeFromLabel,
  displayLabelFromProps,
  labelFromCode,
} from "../utils/cultureLabels";
import { buildError, ERROR_CODES } from "../utils/errors";

const CSV_HEADERS = [
  "Secteur",
  "Exploitations",
  "Code exploitation",
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

function escapeCsvCell(value) {
  const str = value == null ? "" : String(value);
  if (/["\t\n\r]/.test(str)) {
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

function parseCultureValue(raw) {
  const trimmed = raw == null ? "" : String(raw).trim();
  if (!trimmed) return { value: "", code: "" };
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

export function buildParcellesCsv(features, secteur, exploitation, codeExploitation) {
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
    return [
      secteur || props.secteur || "",
      exploitation || props.exploitation || props.exploitations || "",
      codeExploitation || props.code_exploitation || props.codeExploitation || "",
      parcelleName,
      formatNumber(surfaceValue),
      parcelleBio == null ? "" : String(parcelleBio),
      typeSol == null ? "" : String(typeSol),
      displayLabelFromProps(props),
      formatCultureValue(props.cultureN1 ?? props.cultureN_1 ?? ""),
      formatCultureValue(props.cultureN2 ?? ""),
      formatCultureValue(props.cultureN3 ?? ""),
      formatCultureValue(props.cultureN4 ?? ""),
      formatGeometry(feature),
    ];
  });

  return [CSV_HEADERS, ...rows]
    .map((row) => row.map(escapeCsvCell).join("\t"))
    .join("\r\n");
}

export async function parseParcellesCsvToFeatures(file) {
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
    const codeExploitation = map.get("codeexploitation") ?? "";
    const parcelles = map.get("parcelles") ?? "";
    const surfaceParcelle = parseSurfaceValue(map.get("surfaceparcelle"));
    const parcelleBio = map.get("parcellebio") ?? "";
    const typeSol = map.get("typedsol") ?? map.get("typedesol") ?? "";
    const cultureN = parseCultureValue(map.get("culturen"));
    const cultureN1 = parseCultureValue(map.get("culturen1"));
    const cultureN2 = parseCultureValue(map.get("culturen2"));
    const cultureN3 = parseCultureValue(map.get("culturen3"));
    const cultureN4 = parseCultureValue(map.get("culturen4"));
    const ring = parseGeometry(map.get("geometrie"));
    if (!ring) continue;

    const properties = {
      ...(secteur ? { secteur } : {}),
      ...(exploitation ? { exploitation } : {}),
      ...(codeExploitation ? { code_exploitation: codeExploitation } : {}),
      ...(parcelles ? { nom: parcelles, nom_affiche: parcelles } : {}),
      ...(surfaceParcelle != null ? { surface_parcelle: surfaceParcelle } : {}),
      ...(parcelleBio ? { parcelle_bio: parcelleBio } : {}),
      ...(typeSol ? { type_sol: typeSol } : {}),
      ...(cultureN.value ? { cultureN: cultureN.value } : {}),
      ...(cultureN.code ? { code: cultureN.code } : {}),
      ...(cultureN1.value ? { cultureN1: cultureN1.value } : {}),
      ...(cultureN2.value ? { cultureN2: cultureN2.value } : {}),
      ...(cultureN3.value ? { cultureN3: cultureN3.value } : {}),
      ...(cultureN4.value ? { cultureN4: cultureN4.value } : {}),
    };

    features.push({
      type: "Feature",
      properties,
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  }

  return features;
}
