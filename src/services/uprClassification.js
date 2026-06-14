import uprDefinitions from "../config/uprDefinitions.json" with { type: "json" };

const UPR_BY_CODE = new Map(uprDefinitions.units.map((u) => [u.code, u]));

/**
 * Normalise un nom de classe WRB SoilGrids vers la forme « Reference Soil Group »
 * canonique (capitalisée) utilisée par la cascade : "GLEYSOLS" -> "Gleysols",
 * " solonetz " -> "Solonetz". Les noms SoilGrids sont déjà dans la bonne forme
 * (pluriel pour la plupart, mais Solonetz/Solonchaks restent tels quels) : on ne
 * force donc PAS de pluralisation, on ne normalise que casse et espaces.
 */
export function normalizeWrbName(raw) {
  if (raw == null) return null;
  const name = String(raw).trim();
  if (!name) return null;
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

const WRB_SALINE = new Set(["Solonchaks", "Solonetz"]);
const WRB_HYDRO = new Set(["Gleysols", "Stagnosols", "Planosols"]);
const WRB_ACID = new Set(["Podzols", "Acrisols", "Alisols"]);

const weightedMean = (rows, key, weightKey) => {
  let sum = 0;
  let weight = 0;
  for (const row of rows) {
    const value = row?.[key];
    const w = row?.[weightKey];
    if (Number.isFinite(value) && Number.isFinite(w) && w > 0) {
      sum += value * w;
      weight += w;
    }
  }
  return weight > 0 ? sum / weight : null;
};

const parseDepthRangeCm = (depth) => {
  const match = String(depth).match(/^(\d+)-(\d+)\s*cm$/i);
  if (!match) return null;
  return { top: Number(match[1]), bottom: Number(match[2]) };
};

/**
 * Agrège le profil SoilGrids vers les entrées attendues par classifyUpr :
 *   clay/silt/sand = moyenne pondérée épaisseur sur 0-30 cm
 *   ph             = moyenne 0-30 cm
 *   cfvo           = moyenne 0-60 cm
 *   ruMm           = RU directe (wv) si dispo, sinon RU heuristique
 */
export function aggregateUprInputs(profile, summary = {}) {
  const rows = (profile || []).map((row) => {
    const range = parseDepthRangeCm(row.depth);
    const thickness = range ? range.bottom - range.top : 0;
    return {
      ...row,
      _top: range?.top ?? null,
      _bottom: range?.bottom ?? null,
      _thickness: thickness,
      clay_pct: row.clay_pct ?? row.clay ?? null,
      silt_pct: row.silt_pct ?? row.silt ?? null,
      sand_pct: row.sand_pct ?? row.sand ?? null,
      ph_val: row.ph ?? null,
      cfvo_val: row.cfvo_pct ?? row.cfvo ?? null,
    };
  });

  const within = (row, maxCm) => row._top != null && row._top < maxCm;
  const top30 = rows.filter((r) => within(r, 30));
  const top60 = rows.filter((r) => within(r, 60));

  const clay = weightedMean(top30, "clay_pct", "_thickness");
  const silt = weightedMean(top30, "silt_pct", "_thickness");
  const sand = weightedMean(top30, "sand_pct", "_thickness");
  const ph = weightedMean(top30, "ph_val", "_thickness");
  const cfvo = weightedMean(top60, "cfvo_val", "_thickness");
  const ruMm = summary.availableWater_wv_mm ?? summary.availableWater_mm ?? null;

  return {
    clay: clay != null ? Number(clay.toFixed(1)) : null,
    silt: silt != null ? Number(silt.toFixed(1)) : null,
    sand: sand != null ? Number(sand.toFixed(1)) : null,
    ph: ph != null ? Number(ph.toFixed(2)) : null,
    cfvo: cfvo != null ? Number(cfvo.toFixed(1)) : null,
    ruMm: ruMm != null ? Math.round(ruMm) : null,
    ruSource: summary.availableWater_wv_mm != null ? "wv" : "heuristic",
  };
}

const withMeta = (code) => {
  const def = UPR_BY_CODE.get(code);
  return {
    code,
    label: def?.label ?? null,
    limitingFactor: def?.limitingFactor ?? null,
  };
};

/**
 * Cascade de classement UPR (granularité fine, 9 classes A→I).
 * Portage fidèle de la logique agronomique : les contraintes chimiques/hydriques
 * rédhibitoires écrasent la texture ; RU et texture ne tranchent qu'entre sols sains.
 */
// Note : `soc` (statut organique) figure dans le brief comme entrée future (bonification
// de RU / fertilité) mais n'intervient pas encore dans la cascade — non exposé ici.
export function classifyUpr({ wrbClass, clay, silt, sand, ph, cfvo, ruMm } = {}) {
  const wrb = normalizeWrbName(wrbClass);
  const c = Number.isFinite(clay) ? clay : null;
  const si = Number.isFinite(silt) ? silt : null;
  const sa = Number.isFinite(sand) ? sand : null;
  const p = Number.isFinite(ph) ? ph : null;
  const cf = Number.isFinite(cfvo) ? cfvo : 0;
  const ru = Number.isFinite(ruMm) ? ruMm : null;

  // --- Priorité 1 : contraintes chimiques/hydriques rédhibitoires ---
  if (wrb && WRB_SALINE.has(wrb)) return withMeta("I"); // salé / sodique
  if (wrb && WRB_HYDRO.has(wrb)) return withMeta("F"); // hydromorphe
  if ((p != null && p < 5.5) || (wrb && WRB_ACID.has(wrb))) return withMeta("G"); // acide
  if ((p != null && p > 7.3 && wrb === "Calcisols") || (wrb === "Leptosols" && p != null && p > 7.3)) {
    return withMeta("H"); // calcaire / superficiel
  }

  // --- Priorité 2 : superficialité / RU faible (limité par l'eau) ---
  if (wrb === "Leptosols" || cf > 20 || (ru != null && ru < 90) || (sa != null && sa > 55)) {
    return withMeta("E");
  }

  // --- Priorité 3 : comportement vertique ---
  if (wrb === "Vertisols" || (c != null && c > 50)) return withMeta("C");

  // --- Priorité 4 : sols sains, tranchés par TEXTURE avant la RU ---
  if (c != null && c >= 35) return withMeta("B"); // argileux sain
  if (si != null && si > 50 && c != null && c < 30) return withMeta("D"); // limoneux battant (dominante limon)
  if (ru != null && ru >= 150) return withMeta("A"); // équilibré profond, potentiel max
  return withMeta("D"); // fallback raisonnable (limono-argileux moyen)
}

/**
 * Helper d'orchestration : agrège le profil puis classe la parcelle.
 * Retourne { code, label, limitingFactor, inputs }.
 */
export function classifyParcelUpr(profile, summary, wrbClassName) {
  const inputs = aggregateUprInputs(profile, summary);
  const result = classifyUpr({ wrbClass: wrbClassName, ...inputs });
  return { ...result, inputs: { ...inputs, wrbClass: normalizeWrbName(wrbClassName) } };
}

export { uprDefinitions };
