import { parseShapefileZipToFeatures } from "./shapefileZip";
import { ROMANIA_EU_CULTURES } from "../data/romaniaRoCultures";

// Checks presence of Romanian LPIS DBF fields (case-insensitive).
export function isRomanianShapefile(features) {
  if (!features?.length) return false;
  const props = features[0]?.properties || {};
  const keys = Object.keys(props).map((k) => k.toLowerCase());
  return keys.includes("farm_id") || keys.includes("judet");
}

function get(props, ...names) {
  for (const name of names) {
    const val = props[name] ?? props[name.toLowerCase()] ?? props[name.toUpperCase()];
    if (val != null && val !== "") return val;
  }
  return null;
}

function normalizeRomanianProperties(rawProps) {
  const farmId   = get(rawProps, "farm_id");
  const year     = get(rawProps, "year");
  const judet    = get(rawProps, "judet");
  const siruta   = get(rawProps, "siruta");
  const commune  = get(rawProps, "commune");
  const blocNr   = get(rawProps, "bloc_nr");
  const parcelNr = get(rawProps, "parcel_nr");
  const cropNr   = get(rawProps, "crop_nr");
  const catUse   = get(rawProps, "cat_use");
  const cropCode = get(rawProps, "crop_code");
  const cropName = get(rawProps, "crop_name");
  const areaDec  = get(rawProps, "area_dec");
  const agroEnv  = get(rawProps, "agro_env");
  const comment  = get(rawProps, "comment");

  // Resolve culture code → metacode + Romanian name
  const codeKey = cropCode != null ? String(cropCode).trim() : null;
  const entry = codeKey ? ROMANIA_EU_CULTURES[codeKey] : null;
  const metacode    = entry?.metacode ?? "";
  const nomRo       = entry?.nomRo ?? (cropName ? String(cropName).trim() : "");
  const codeCulture = metacode || codeKey || "";

  // Human-readable parcel name: "Bloc 88 – Parc. 2a"
  let nomAffiche = null;
  if (blocNr != null && parcelNr != null) {
    const suffix = cropNr ? String(cropNr).trim() : "";
    nomAffiche = `Bloc ${blocNr} – Parc. ${parcelNr}${suffix}`;
  }

  const normalized = {
    // Standard app fields
    code_exploitation: farmId != null ? String(farmId) : null,
    annee:             year   != null ? Number(year)   : null,
    ilot:              blocNr != null ? String(blocNr) : null,
    parcelleNo:        parcelNr != null ? String(parcelNr) : null,
    nom_parcelle:      nomAffiche,
    nom_affiche:       nomAffiche,
    code_culture:      codeCulture,
    surface:           areaDec != null ? Number(areaDec) : null,
    categorie_utilisation: catUse != null ? String(catUse) : null,
    // Romanian-specific preserved fields
    judet:             judet   != null ? String(judet)   : null,
    siruta:            siruta  != null ? String(siruta)  : null,
    commune:           commune != null ? String(commune) : null,
    crop_nr:           cropNr  != null ? String(cropNr)  : null,
    nom_culture_ro:    nomRo,
    agro_env:          agroEnv != null ? String(agroEnv) : null,
    comment:           comment != null ? String(comment) : null,
    // Raw originals for traceability
    _ro_crop_code:     codeKey,
    _ro_farm_id:       farmId  != null ? String(farmId)  : null,
  };

  // Strip nulls
  return Object.fromEntries(Object.entries(normalized).filter(([, v]) => v != null));
}

export function normalizeRomanianFeatures(features) {
  return features.map((feat) => ({
    ...feat,
    properties: normalizeRomanianProperties(feat.properties || {}),
  }));
}

export async function parseRomanianShapefileZipToFeatures(fileOrBuffer) {
  const features = await parseShapefileZipToFeatures(fileOrBuffer);
  if (!isRomanianShapefile(features)) {
    throw new Error("RO_SHAPEFILE: Le fichier ne semble pas être un shapefile LPIS roumain");
  }
  return normalizeRomanianFeatures(features);
}
