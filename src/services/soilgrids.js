const DEFAULT_DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"];
const DEFAULT_PROPERTIES = ["clay", "silt", "sand", "bdod", "soc", "nitrogen", "phh2o", "cec", "cfvo", "wv0033", "wv1500"];

const PROPERTY_ALIASES = {
  clay: ["clay"],
  silt: ["silt"],
  sand: ["sand"],
  bdod: ["bdod", "bulk_density"],
  soc: ["soc", "ocd"],
  nitrogen: ["nitrogen", "nitrogen_total"],
  phh2o: ["phh2o", "ph"],
  cec: ["cec"],
  cfvo: ["cfvo"],
  wv0033: ["wv0033"],
  wv1500: ["wv1500"],
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeTextureFractions = (texture, warnings) => {
  const total = (texture.clay_pct || 0) + (texture.silt_pct || 0) + (texture.sand_pct || 0);
  if (total <= 0) return texture;
  if (Math.abs(total - 100) > 5) {
    warnings.push("renormalized_texture");
    return {
      clay_pct: Number(((texture.clay_pct / total) * 100).toFixed(1)),
      silt_pct: Number(((texture.silt_pct / total) * 100).toFixed(1)),
      sand_pct: Number(((texture.sand_pct / total) * 100).toFixed(1)),
    };
  }
  return texture;
};

const getByPath = (obj, path) => path.reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), obj);

const plausiblePercent = (value) => Number.isFinite(value) && value >= 0 && value <= 100;

const normalizeValue = (property, value, unit, warnings, dFactor) => {
  if (!Number.isFinite(value)) return null;
  const normalizedUnit = unit ? String(unit).toLowerCase() : "";
  const hasDFactor = Number.isFinite(dFactor) && dFactor > 0;
  if (property === "clay" || property === "silt" || property === "sand") {
    if (normalizedUnit.includes("g/kg")) return value / 10;
    return value;
  }
  if (property === "cfvo") {
    // SoilGrids : mapped "cm³/dm³" (‰) -> target "cm³/100cm³" (= %), d_factor 10.
    if (hasDFactor) return value / dFactor;
    if (normalizedUnit.includes("g/kg") || normalizedUnit.includes("cm3/dm3") || normalizedUnit.includes("cm³/dm³")) return value / 10;
    return value;
  }
  if (property === "phh2o") {
    // SoilGrids : mapped "pH*10", d_factor 10 -> pH réel = raw / 10.
    if (hasDFactor && value > 14) return value / dFactor;
    if (value > 14) return value / 10; // un pH n'excède jamais 14
    return value;
  }
  if (property === "bdod") {
    if (normalizedUnit.includes("kg/m3")) return value / 1000;
    if (normalizedUnit.includes("cg/cm3")) return value / 100;
    if (normalizedUnit.includes("dg/cm3")) return value / 10;
    if (value > 20) return value / 100;
    return value;
  }
  if (property === "soc") {
    // SoilGrids : mapped "dg/kg" (d_factor 10) -> target "g/kg" ; on veut des % (= g/kg / 10).
    // ATTENTION : "dg/kg"/"cg/kg" contiennent "g/kg" -> tester les unités spécifiques d'abord.
    if (hasDFactor) return value / dFactor / 10;
    if (normalizedUnit.includes("dg/kg")) return value / 100;
    if (normalizedUnit.includes("cg/kg")) return value / 1000;
    if (normalizedUnit.includes("g/kg")) return value / 10;
    if (plausiblePercent(value)) return value;
    if (value > 100) return value / 100;
    warnings.push("unit_unknown_soc");
    return value;
  }
  if (property === "nitrogen") {
    // SoilGrids : mapped "cg/kg" (d_factor 100) -> target "g/kg" ; on veut des % (= g/kg / 10).
    if (hasDFactor) return value / dFactor / 10;
    if (normalizedUnit.includes("dg/kg")) return value / 100;
    if (normalizedUnit.includes("cg/kg")) return value / 1000;
    if (normalizedUnit.includes("g/kg")) return value / 10;
    if (value > 10) return value / 100;
    return value;
  }
  if (property === "wv0033" || property === "wv1500") {
    // SoilGrids : mapped "(10-2 cm³/cm³)*10", target "10-2 cm³/cm³" (= v%), d_factor 10.
    // raw / d_factor donne directement des v% (= cm³/cm³ × 100).
    if (hasDFactor) return value / dFactor;
    if (normalizedUnit.includes("v%") || normalizedUnit.includes("cm3/dm3") || normalizedUnit.includes("0.1")) {
      return value / 10;
    }
    if (normalizedUnit.includes("cm3/cm3") && value <= 1) return value * 100; // fraction brute 0-1
    // Repli : les valeurs brutes plausibles (>50) sont des 0.1 v% non étiquetés.
    if (value > 50) return value / 10;
    warnings.push("unit_unknown_wv");
    return value;
  }
  return value;
};

const parseLayerDepth = (layer, depth) => {
  const depthEntry = (layer.depths || []).find((entry) => `${entry?.range?.top_depth}-${entry?.range?.bottom_depth}cm` === depth);
  if (!depthEntry) return null;
  const unitMeasure = depthEntry?.values?.unit_measure || layer?.unit_measure || null;
  return {
    value: getByPath(depthEntry, ["values", "mean"]),
    unit: depthEntry?.values?.unit_measure?.mapped_units || depthEntry?.values?.unit_measure?.target_units || layer?.unit_measure?.mapped_units || layer?.unit_measure?.target_units || null,
    dFactor: unitMeasure?.d_factor ?? layer?.unit_measure?.d_factor ?? null,
  };
};

const findLayer = (layers, property) => layers.find((layer) => PROPERTY_ALIASES[property].includes(layer?.name));

export function parseSoilGridsProperties(raw, { depths = DEFAULT_DEPTHS } = {}) {
  const layers = raw?.properties?.layers || [];
  const profile = depths.map((depth) => {
    const warnings = [];
    const row = { depth, warnings };
    for (const property of DEFAULT_PROPERTIES) {
      const layer = findLayer(layers, property);
      if (!layer) {
        warnings.push(`missing_property:${property}`);
        continue;
      }
      const parsed = parseLayerDepth(layer, depth);
      if (!parsed || parsed.value == null) {
        warnings.push(`missing_depth:${property}:${depth}`);
        continue;
      }
      const normalized = normalizeValue(property, Number(parsed.value), parsed.unit, warnings, parsed.dFactor);
      row[property] = normalized;
      row[`${property}_unit`] = parsed.unit;
    }

    const socPct = row.soc ?? null;
    row.organicMatter_pct = Number.isFinite(socPct) ? Number((socPct * 1.724).toFixed(2)) : null;
    row.nitrogen_pct = Number.isFinite(row.nitrogen) ? Number(row.nitrogen.toFixed(3)) : null;
    row.bulkDensity_gcm3 = Number.isFinite(row.bdod) ? Number(row.bdod.toFixed(2)) : null;
    row.cec_cmolkg = Number.isFinite(row.cec) ? Number(row.cec.toFixed(2)) : null;
    row.ph = Number.isFinite(row.phh2o) ? Number(row.phh2o.toFixed(2)) : null;
    row.cfvo_pct = Number.isFinite(row.cfvo) ? Number(row.cfvo.toFixed(1)) : null;
    row.wv0033_pct = Number.isFinite(row.wv0033) ? Number(row.wv0033.toFixed(1)) : null;
    row.wv1500_pct = Number.isFinite(row.wv1500) ? Number(row.wv1500.toFixed(1)) : null;

    return row;
  });

  return profile;
}

const textureClassFr = ({ clay_pct, silt_pct, sand_pct }) => {
  if (clay_pct >= 40 && sand_pct <= 45) return "argileux";
  if (clay_pct >= 27 && clay_pct < 40 && silt_pct >= 20 && silt_pct <= 45) return "limono-argileux";
  if (silt_pct >= 50 && clay_pct < 27) return "limoneux";
  if (sand_pct >= 70 && clay_pct < 15) return "sableux";
  if (sand_pct >= 45 && clay_pct < 20) return "sablo-limoneux";
  return "équilibré";
};

const RU_TABLE_MM_PER_CM = {
  argileux: 1.6,
  "limono-argileux": 1.9,
  limoneux: 2.0,
  sableux: 1.1,
  "sablo-limoneux": 1.4,
  "équilibré": 1.7,
};

const parseDepthRangeCm = (depth) => {
  const match = String(depth).match(/^(\d+)-(\d+)\s*cm$/i);
  if (!match) return null;
  return { top: Number(match[1]), bottom: Number(match[2]) };
};

const ROOT_ZONE_CM = 80; // profondeur de la zone effectivement peuplée par les racines
const SOILGRIDS_MAX_DEPTH_CM = 200; // dernier horizon disponible dans SoilGrids
const CAPILLARY_EFFICIENCY = 0.5; // l'eau sous la zone racinaire n'est que partiellement réalimentée par capillarité

/**
 * Distance de remontée capillaire selon la texture (ordres de grandeur) :
 * argiles ~2 m, limons ~1 m, sables ~40 cm. Plus la texture est fine, plus l'eau
 * remonte loin sous la zone racinaire.
 */
const capillaryRiseDistanceCm = ({ clay_pct, sand_pct } = {}) => {
  if (Number.isFinite(sand_pct) && sand_pct >= 55) return 40; // sables (seuil abaissé 65 -> 55)
  if (Number.isFinite(clay_pct) && clay_pct >= 35) return 200; // argiles
  return 100; // limons / équilibré (branche par défaut)
};

/**
 * Coefficient de rétention de la RU selon la vitesse de ressuyage (texture/cailloux).
 * Plus un sol ressuie vite, moins il retient l'eau « disponible » statique (wv0033−wv1500)
 * surestime alors la RU réelle → on décote. Calé sur les durées de ressuyage observées :
 * graviers 2-4 j (×0.4), sables 3-5 j (×0.5), équilibré <6 j (×0.85), limons/argiles 8-12 j (×1.0).
 */
export const drainageRetentionFactor = ({ clay_pct, silt_pct, sand_pct } = {}, cfvo_pct = 0) => {
  if (Number.isFinite(cfvo_pct) && cfvo_pct > 20) return 0.4; // graviers / sols caillouteux
  if (Number.isFinite(sand_pct) && sand_pct >= 55) return 0.5; // sableux
  if (Number.isFinite(silt_pct) && silt_pct > 50) return 1.0; // limoneux / loess
  if (Number.isFinite(clay_pct) && clay_pct >= 35) return 1.0; // argileux profond
  return 0.85; // équilibré sain
};

/**
 * Profondeur d'intégration de la RU = zone racinaire (~80 cm) + remontée capillaire,
 * car l'eau remontant depuis les horizons sous-racinaires reste disponible pour la culture.
 * Plafonnée à 200 cm (profondeur max des données SoilGrids).
 * Ex. sable : 80 + 40 = 120 cm ; limon : 80 + 100 = 180 cm ; argile : 80 + 200 → 200 cm.
 */
export const ruIntegrationDepthCm = (texture = {}) =>
  Math.min(ROOT_ZONE_CM + capillaryRiseDistanceCm(texture), SOILGRIDS_MAX_DEPTH_CM);

/**
 * RU (mm) calculée directement depuis les teneurs en eau volumiques SoilGrids.
 * Pour chaque horizon : eau disponible = (wv0033 − wv1500)/100 × épaisseur_mm × (1 − cfvo/100).
 * La réserve située SOUS la zone racinaire (`ROOT_ZONE_CM` = 80 cm) n'est comptée qu'à
 * `CAPILLARY_EFFICIENCY` (50 %), car elle n'est que partiellement réalimentée par remontée
 * capillaire. Intégrée jusqu'à `rootingDepthCm` (plafonnée si Leptosol).
 * `retentionFactor` (≤ 1) décote la RU des sols à ressuyage rapide (cf. drainageRetentionFactor).
 * Retourne `null` si aucun horizon ne porte de couple wv exploitable.
 */
export function computeAvailableWaterFromWv(profile, { wrbClass = null, rootingDepthCm = 100, retentionFactor = 1 } = {}) {
  const warnings = [];
  let effectiveDepthCm = rootingDepthCm;
  if (wrbClass && String(wrbClass).toLowerCase().startsWith("leptosol")) {
    effectiveDepthCm = Math.min(effectiveDepthCm, 30);
    warnings.push("rooting_depth_capped_leptosol");
  }

  let total = 0;
  let horizonsUsed = 0;
  for (const row of profile) {
    const range = parseDepthRangeCm(row.depth);
    if (!range) continue;
    if (range.top >= effectiveDepthCm) continue;
    const bottom = Math.min(range.bottom, effectiveDepthCm);
    if (bottom <= range.top) continue;

    const fc = Number.isFinite(row.wv0033) ? row.wv0033 : row.wv0033_pct;
    const wp = Number.isFinite(row.wv1500) ? row.wv1500 : row.wv1500_pct;
    if (!Number.isFinite(fc) || !Number.isFinite(wp)) continue;

    const availFraction = Math.max(0, (fc - wp) / 100);
    const cfvoFraction = clamp((row.cfvo_pct ?? row.cfvo ?? 0) / 100, 0, 0.95);
    const ruPerMm = availFraction * (1 - cfvoFraction);

    // Part dans la zone racinaire (0-80 cm) à 100 %, part sous-racinaire à 50 %.
    const rootMm = Math.max(0, Math.min(bottom, ROOT_ZONE_CM) - range.top) * 10;
    const capMm = Math.max(0, bottom - Math.max(range.top, ROOT_ZONE_CM)) * 10;
    total += ruPerMm * (rootMm + capMm * CAPILLARY_EFFICIENCY);
    horizonsUsed += 1;
  }

  if (horizonsUsed === 0) return null;
  return {
    availableWater_wv_mm: Math.round(total * retentionFactor),
    horizonsUsed,
    rootingDepthCm: effectiveDepthCm,
    retentionFactor,
    warnings,
  };
}

export function computeSoilIndicators(profile, { wrbClass = null } = {}) {
  const warnings = [];
  const top = profile.find((row) => row.depth === "0-5cm") || profile[0] || {};
  const texture = normalizeTextureFractions(
    {
      clay_pct: Number(top.clay || 0),
      silt_pct: Number(top.silt || 0),
      sand_pct: Number(top.sand || 0),
    },
    warnings
  );
  const textureClass = textureClassFr(texture);

  const bd = Number(top.bulkDensity_gcm3 ?? top.bdod ?? 1.4);
  let porosity = 1 - bd / 2.65;
  let clampApplied = false;
  if (porosity < 0.2 || porosity > 0.7) {
    clampApplied = true;
    porosity = clamp(porosity, 0.2, 0.7);
    warnings.push("clamp_porosity");
  }

  const cfvoFraction = clamp((top.cfvo_pct ?? top.cfvo ?? 0) / 100, 0, 0.8);
  let depthCm = 100;
  if (cfvoFraction > 0.35) depthCm = 80;
  if (!Number.isFinite(top.bulkDensity_gcm3) && !Number.isFinite(top.bdod)) depthCm = 80;

  const ruPerCm = RU_TABLE_MM_PER_CM[textureClass] ?? 1.7;
  const ruSimple = ruPerCm * depthCm * (1 - cfvoFraction);
  const socAdj = Number.isFinite(top.organicMatter_pct) ? 1 + Math.min(top.organicMatter_pct / 100, 0.2) : 1;
  const bdAdj = Number.isFinite(bd) ? clamp(1.6 - (bd - 1.2), 0.8, 1.2) : 1;
  const availableWater_mm = Math.round(ruSimple * socAdj * bdAdj);

  let drainage = "bon";
  if (texture.sand_pct > 65 && porosity > 0.45) drainage = "rapide";
  if (texture.clay_pct > 40 || porosity < 0.32) drainage = "lent";
  if (texture.clay_pct > 45 && porosity < 0.3) drainage = "probable_hydromorphe";

  const integrationDepthCm = ruIntegrationDepthCm(texture);
  const retentionFactor = drainageRetentionFactor(texture, top.cfvo_pct ?? top.cfvo ?? 0);
  const ruDirect = computeAvailableWaterFromWv(profile, { wrbClass, rootingDepthCm: integrationDepthCm, retentionFactor });
  if (ruDirect) {
    warnings.push(...ruDirect.warnings);
  } else {
    warnings.push("ru_wv_unavailable_fallback_heuristic");
  }

  const missingScore = profile.reduce((acc, row) => acc + row.warnings.length, 0);
  const confidence = missingScore > 20 ? "low" : missingScore > 8 ? "medium" : "high";

  if (clampApplied) warnings.push("clamp_applied=true");

  return {
    textureClass,
    texture,
    ph: top.ph ?? null,
    organicMatter_pct: top.organicMatter_pct ?? null,
    nitrogen_pct: top.nitrogen_pct ?? null,
    cec_cmolkg: top.cec_cmolkg ?? null,
    bulkDensity_gcm3: Number.isFinite(bd) ? Number(bd.toFixed(2)) : null,
    porosity_pct: Number((porosity * 100).toFixed(1)),
    availableWater_mm,
    availableWater_wv_mm: ruDirect ? ruDirect.availableWater_wv_mm : null,
    availableWater_wv_depth_cm: ruDirect ? ruDirect.rootingDepthCm : integrationDepthCm,
    drainage,
    depth_cm: depthCm,
    confidence,
    warnings,
  };
}

export function buildSoilGridsResponse({ parcelId, lat, lon, pointStrategy, fetchedAt, calcVersion, profile, summary, wrb = null, upr = null }) {
  return {
    parcelId,
    source: {
      name: "SoilGrids",
      endpoint: "properties/query + classification/query",
      resolution: "250m",
      fetchedAt,
      lat,
      lon,
      pointStrategy,
      calcVersion,
    },
    wrb,
    upr,
    summary,
    profile: profile.map((row) => ({
      depth: row.depth,
      clay_pct: row.clay ?? null,
      silt_pct: row.silt ?? null,
      sand_pct: row.sand ?? null,
      ph: row.ph ?? null,
      soc: { value: row.soc ?? null, unit: row.soc_unit || "%C" },
      organicMatter_pct: row.organicMatter_pct ?? null,
      nitrogen_pct: row.nitrogen_pct ?? null,
      cec_cmolkg: row.cec_cmolkg ?? null,
      bulkDensity_gcm3: row.bulkDensity_gcm3 ?? null,
      cfvo_pct: row.cfvo_pct ?? null,
      wv0033_pct: row.wv0033_pct ?? null,
      wv1500_pct: row.wv1500_pct ?? null,
      warnings: row.warnings,
    })),
  };
}

export { DEFAULT_DEPTHS, DEFAULT_PROPERTIES };
