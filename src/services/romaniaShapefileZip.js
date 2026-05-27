import JSZip from "jszip";
import { parseShapefileZipToFeatures } from "./shapefileZip";
import { ROMANIA_EU_CULTURES } from "../data/romaniaRoCultures";

// ─── Projection ──────────────────────────────────────────────────────────────
// Stereo70 EPSG:31700 — projection officielle du LPIS roumain APIA.
// Le fichier .prj du ZIP APIA est toujours vide ; shpjs tente proj4("") qui
// lève une exception. On réinjecte la définition proj4 complète avant le parse.
//
// ⚠️  DATUM SHIFT CRITIQUE : le paramètre +towgs84 est indispensable.
//   Sans lui, proj4 suppose Pulkovo 1942(58) ≡ WGS84 → décalage ~100-200 m en Roumanie.
//   Valeurs officielles EPSG (transformation EPSG:15776, valable pour la Roumanie) :
//   tx=33.4  ty=-146.6  tz=-76.3  rx=-0.359  ry=-0.053  rz=0.844  ds=-0.84
//
// On injecte la chaîne proj4 directement (format +proj=…) plutôt qu'un WKT,
// car proj4.js la parse de façon plus fiable, notamment le bloc towgs84.
const STEREO70_PRJ =
  "+proj=sterea +lat_0=46 +lon_0=25 +k=0.99975 +x_0=500000 +y_0=500000 " +
  "+ellps=krass +towgs84=33.4,-146.6,-76.3,-0.359,-0.053,0.844,-0.84 +units=m +no_defs";

// ─── Détection AVANT parse ────────────────────────────────────────────────────

/** Détecte un ZIP LPIS roumain par le pattern de nom de fichier (ex: RO006248036_2025_0.shp). */
export async function isRomanianZipBuffer(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    return Object.keys(zip.files).some((n) => /RO\d{7,9}_\d{4}/i.test(n));
  } catch {
    return false;
  }
}

// ─── Patch du ZIP ────────────────────────────────────────────────────────────

/**
 * Recrée le ZIP en injectant le WKT Stereo70 dans chaque .prj vide ou absent.
 * Cela évite que shpjs lève une exception sur proj4("") lors du parse.
 * shpjs utilisera ensuite Double_Stereographic → inverse() pour projeter en WGS84.
 */
async function patchPrjInZip(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const newZip = new JSZip();

  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir) continue;

    if (name.toLowerCase().endsWith(".prj")) {
      // Remplace toujours le .prj par le WKT Stereo70 (même s'il était non vide)
      newZip.file(name, STEREO70_PRJ);
    } else {
      newZip.file(name, await file.async("arraybuffer"));
    }
  }

  return newZip.generateAsync({ type: "arraybuffer" });
}

// ─── Normalisation APRÈS parse ───────────────────────────────────────────────

/** Détecte si des features viennent d'un shapefile LPIS roumain (farm_id / judet). */
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

  // Résolution culture : EU code numérique → metacode interne + nom roumain
  const codeKey = cropCode != null ? String(cropCode).trim() : null;
  const entry = codeKey ? ROMANIA_EU_CULTURES[codeKey] : null;
  const metacode    = entry?.metacode ?? "";
  const nomRo       = entry?.nomRo ?? (cropName ? String(cropName).trim() : "");
  const assoliaCrop = entry?.assolia ?? null;
  const codeCulture = metacode || codeKey || "";

  // Nom affiché : "Bloc 88 – Parc. 2a"
  let nomAffiche = null;
  if (blocNr != null && parcelNr != null) {
    const suffix = cropNr ? String(cropNr).trim() : "";
    nomAffiche = `Bloc ${blocNr} – Parc. ${parcelNr}${suffix}`;
  }

  const normalized = {
    // Champs standard de l'app
    code_exploitation: farmId   != null ? String(farmId)   : null,
    annee:             year     != null ? Number(year)      : null,
    ilot:              blocNr   != null ? String(blocNr)    : null,
    parcelleNo:        parcelNr != null ? String(parcelNr)  : null,
    nom_parcelle:      nomAffiche,
    nom_affiche:       nomAffiche,
    code_culture:      codeCulture,
    surface:           areaDec  != null ? Number(areaDec)   : null,
    categorie_utilisation: catUse != null ? String(catUse)  : null,
    // Champs spécifiques Roumanie conservés
    judet:             judet    != null ? String(judet)     : null,
    siruta:            siruta   != null ? String(siruta)    : null,
    commune:           commune  != null ? String(commune)   : null,
    crop_nr:           cropNr   != null ? String(cropNr)    : null,
    nom_culture_ro:    nomRo || null,
    assolia_culture:   assoliaCrop || null,
    agro_env:          agroEnv  != null ? String(agroEnv)   : null,
    comment:           comment  != null ? String(comment)   : null,
    // Originaux pour traçabilité
    _ro_crop_code:     codeKey,
    _ro_farm_id:       farmId   != null ? String(farmId)    : null,
  };

  // Supprime les nulls
  return Object.fromEntries(Object.entries(normalized).filter(([, v]) => v != null));
}

export function normalizeRomanianFeatures(features) {
  return features.map((feat) => ({
    ...feat,
    properties: normalizeRomanianProperties(feat.properties || {}),
  }));
}

// ─── Point d'entrée principal ─────────────────────────────────────────────────

/**
 * Parse un ZIP LPIS roumain :
 * 1. Injecte le WKT Stereo70 dans le .prj (fix de l'exception shpjs sur .prj vide)
 * 2. Passe le buffer corrigé à parseShapefileZipToFeatures (shpjs reprojette en WGS84)
 * 3. Normalise les propriétés DBF roumaines vers le schéma interne
 */
export async function parseRomanianShapefileZipToFeatures(buffer) {
  const patchedBuffer = await patchPrjInZip(buffer);
  const rawFeats = await parseShapefileZipToFeatures(patchedBuffer);
  return normalizeRomanianFeatures(rawFeats);
}
