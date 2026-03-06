const DEFAULT_DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm"];
const DEFAULT_PROPERTIES = ["clay", "silt", "sand", "bdod", "soc", "nitrogen", "phh2o", "cec", "cfvo"];

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

const normalizeValue = (property, value, unit, warnings) => {
  if (!Number.isFinite(value)) return null;
  const normalizedUnit = unit ? String(unit).toLowerCase() : "";
  if (property === "clay" || property === "silt" || property === "sand" || property === "cfvo") {
    if (normalizedUnit.includes("g/kg")) return value / 10;
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
    if (normalizedUnit.includes("g/kg")) return value / 10;
    if (normalizedUnit.includes("dg/kg")) return value / 100;
    if (normalizedUnit.includes("cg/kg")) return value / 1000;
    if (plausiblePercent(value)) return value;
    if (value > 100) return value / 100;
    warnings.push("unit_unknown_soc");
    return value;
  }
  if (property === "nitrogen") {
    if (normalizedUnit.includes("g/kg")) return value / 10;
    if (normalizedUnit.includes("cg/kg")) return value / 1000;
    if (value > 10) return value / 100;
    return value;
  }
  return value;
};

const parseLayerDepth = (layer, depth) => {
  const depthEntry = (layer.depths || []).find((entry) => `${entry?.range?.top_depth}-${entry?.range?.bottom_depth}cm` === depth);
  if (!depthEntry) return null;
  return {
    value: getByPath(depthEntry, ["values", "mean"]),
    unit: depthEntry?.values?.unit_measure?.mapped_units || depthEntry?.values?.unit_measure?.target_units || layer?.unit_measure?.mapped_units || layer?.unit_measure?.target_units || null,
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
      const normalized = normalizeValue(property, Number(parsed.value), parsed.unit, warnings);
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

export function computeSoilIndicators(profile) {
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
    drainage,
    depth_cm: depthCm,
    confidence,
    warnings,
  };
}

export function buildSoilGridsResponse({ parcelId, lat, lon, pointStrategy, fetchedAt, calcVersion, profile, summary }) {
  return {
    parcelId,
    source: {
      name: "SoilGrids",
      endpoint: "properties/query",
      resolution: "250m",
      fetchedAt,
      lat,
      lon,
      pointStrategy,
      calcVersion,
    },
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
      warnings: row.warnings,
    })),
  };
}

export { DEFAULT_DEPTHS, DEFAULT_PROPERTIES };
