import { ringAreaM2 } from "../utils/geometry";
import { toLambert93 } from "../utils/proj";
import { createShapefileZip } from "./shapefileWriter";
import { labelFromCode } from "../utils/cultureLabels";

const TYPE_PARCELLE_LABEL = "Parcelleáprincipale";

const PARCEL_FIELD_SCHEMA = [
  { name: "CODE_EXPLO", type: "C", size: 20 },
  { name: "RAIS_SOCIA", type: "C", size: 50 },
  { name: "CAMPAGNE", type: "N", size: 9 },
  { name: "GUID_PARC", type: "C", size: 36 },
  { name: "TYPE_PARC", type: "C", size: 30 },
  { name: "NOM_PARCEL", type: "C", size: 253 },
  { name: "SURFACE", type: "N", size: 18 },
  { name: "CP_CULTU", type: "C", size: 25 },
  { name: "CULT_PREC", type: "C", size: 25 },
  { name: "TYPE_SOL", type: "C", size: 75 },
];

const CULTURE_LABEL_KEYS = [
  "LIB_CULTURE",
  "LIB_CULTU",
  "NOM_CULTURE",
  "CULTURE",
  "culture",
  "LIBELLE_CULTURE",
  "CP_CULTU_LIB",
];
const CULTURE_CODE_KEYS = ["CP_CULTU", "code", "CODE", "code_culture", "CODE_CULTURE", "CODE_CULTU"];
const CULTURE_PREV2_LABEL_KEYS = ["CULT_PREC2_LIB", "CULT_PREC_LABEL", "CULT_PREC2_LABEL"];
const CULTURE_PREV2_CODE_KEYS = ["CULT_PREC2", "culture_prec2"];

function toLatin1String(input) {
  if (input == null) return "";
  const normalized = String(input).normalize("NFKD");
  let out = "";
  for (const char of normalized) {
    const code = char.codePointAt(0);
    if (code <= 0xff) {
      out += String.fromCharCode(code);
    } else if (code >= 0x0300 && code <= 0x036f) {
      // ignore combining marks outside latin1 once normalized
    } else {
      out += "?";
    }
  }
  return out;
}

function randomCodeExploit() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

function randomGuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function pickFirstValue(props, keys) {
  for (const key of keys) {
    const value = props[key];
    if (value != null) {
      const trimmed = String(value).trim();
      if (trimmed !== "") return trimmed;
    }
  }
  return "";
}

function resolveCultureLabel(props, labelKeys, codeKeys) {
  const direct = pickFirstValue(props, labelKeys);
  if (direct) return direct;
  for (const key of codeKeys) {
    const value = props[key];
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (!trimmed) continue;
    const fromCode = labelFromCode(trimmed.toUpperCase());
    return fromCode || trimmed;
  }
  return "";
}

function computeSurfaceHa(feature) {
  const { geometry } = feature || {};
  if (!geometry) return 0;
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates?.[0] ?? [];
    return Math.abs(ringAreaM2(ring)) / 10000;
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce((sum, polygon) => {
      const ring = polygon?.[0] ?? [];
      return sum + Math.abs(ringAreaM2(ring)) / 10000;
    }, 0);
  }
  return 0;
}

function ensureGuid(props = {}) {
  const existing = props.GUID_PARC || props.guid_parcelle || props.guid;
  if (existing) return existing;
  const guid = randomGuid();
  props.GUID_PARC = guid;
  props.guid_parcelle = guid;
  return guid;
}

function ensureCodeExploit(features, fallback) {
  for (const feature of features) {
    const props = feature?.properties || {};
    const code = props.CODE_EXPLO || props.code_exploitation || props.code_explo;
    if (code != null && String(code).trim() !== "") {
      return String(code).trim();
    }
  }
  return fallback ?? randomCodeExploit();
}

function normalizeParcelFeature(feature, meta, index) {
  if (!feature || !feature.geometry) return null;
  if (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon") {
    return null;
  }

  const props = { ...(feature.properties || {}) };
  const guid = ensureGuid(props);
  const name = pickFirstValue(props, ["NOM_PARCEL", "nom_parcelle", "nom_affiche", "nom"])
    || `Parcelle ${index + 1}`;
  const typeSol = pickFirstValue(props, ["TYPE_SOL", "type_sol"]);
  const cultureLabel = resolveCultureLabel(props, CULTURE_LABEL_KEYS, CULTURE_CODE_KEYS);
  const prev2Label = resolveCultureLabel(props, CULTURE_PREV2_LABEL_KEYS, CULTURE_PREV2_CODE_KEYS);
  const surfaceHa = computeSurfaceHa(feature);

  const campagneInt = Number.isFinite(meta.campagneInt)
    ? meta.campagneInt
    : Number.parseInt(meta.campagne, 10);

  const shapeProps = {
    CODE_EXPLO: toLatin1String(meta.codeExploit),
    RAIS_SOCIA: toLatin1String(meta.raisSoc),
    CAMPAGNE: Number.isFinite(campagneInt) ? campagneInt : new Date().getFullYear(),
    GUID_PARC: toLatin1String(guid),
    TYPE_PARC: toLatin1String(TYPE_PARCELLE_LABEL),
    NOM_PARCEL: toLatin1String(name),
    SURFACE: Number(surfaceHa.toFixed(4)),
    CP_CULTU: toLatin1String(cultureLabel),
    CULT_PREC: toLatin1String(prev2Label),
    TYPE_SOL: toLatin1String(typeSol),
  };

  return {
    feature: { ...feature, properties: props },
    shapefileFeature: {
      type: "Feature",
      geometry: feature.geometry,
      properties: shapeProps,
    },
  };
}

function projectRingToLambert(ring = []) {
  return ring.map((coord) => {
    const [lon, lat] = Array.isArray(coord) ? coord : [0, 0];
    const [x, y] = toLambert93([lon, lat]);
    return [x, y];
  });
}

function projectGeometryToLambert(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: (geometry.coordinates || []).map((ring) => projectRingToLambert(ring)),
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: (geometry.coordinates || []).map((polygon) =>
        (polygon || []).map((ring) => projectRingToLambert(ring))
      ),
    };
  }
  return null;
}

function projectFeaturesToLambert(features) {
  return features
    .map((feature) => {
      const geometry = projectGeometryToLambert(feature.geometry);
      if (!geometry) return null;
      return { ...feature, geometry };
    })
    .filter(Boolean);
}

export async function buildParcelShapefileZip(features, { raisSoc, campagne, codeExploit } = {}) {
  if (!Array.isArray(features) || features.length === 0) {
    throw new Error("NO_PARCELS");
  }
  const rais = toLatin1String((raisSoc ?? "").trim().toUpperCase());
  if (!rais) {
    throw new Error("RAIS_SOCIA_REQUIRED");
  }
  const currentYear = new Date().getFullYear().toString();
  const campagneInput = (campagne ?? currentYear).toString().trim() || currentYear;
  const campagneValue = toLatin1String(campagneInput);
  const campagneInt = Number.parseInt(campagneInput, 10);

  const codeValue = toLatin1String(ensureCodeExploit(features, codeExploit));

  const normalized = [];
  const shapefileFeatures = [];

  features.forEach((feature, index) => {
    const normalizedEntry = normalizeParcelFeature(
      feature,
      {
        raisSoc: rais,
        campagne: campagneValue,
        campagneInt: Number.isFinite(campagneInt) ? campagneInt : undefined,
        codeExploit: codeValue,
      },
      index
    );
    if (!normalizedEntry) return;
    const { feature: nextFeature, shapefileFeature } = normalizedEntry;
    nextFeature.properties = {
      ...(nextFeature.properties || {}),
      CODE_EXPLO: codeValue,
      code_exploitation: codeValue,
      GUID_PARC: shapefileFeature.properties.GUID_PARC,
      guid_parcelle: shapefileFeature.properties.GUID_PARC,
    };
    normalized.push(nextFeature);
    shapefileFeatures.push(shapefileFeature);
  });

  if (!shapefileFeatures.length) {
    throw new Error("NO_POLYGONS");
  }

  const lambertFeatures = projectFeaturesToLambert(shapefileFeatures);
  const arrayBuffer = await createShapefileZip({
    features: lambertFeatures,
    baseName: rais,
    fields: PARCEL_FIELD_SCHEMA,
  });
  const blob = new Blob([arrayBuffer], { type: "application/zip" });

  return { blob, updatedFeatures: normalized };
}
