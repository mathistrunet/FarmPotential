// src/utils/cultureLabels.js

function readCodebookNow() {
  const raw = (typeof window !== "undefined" && window.CODEBOOK_EXTRA && typeof window.CODEBOOK_EXTRA === "object")
    ? window.CODEBOOK_EXTRA
    : {};

  const cb = Object.create(null);
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim().toUpperCase();
    const label = String(v).trim();
    if (key) cb[key] = label;
  }
  return cb;
}

function readCodebookPrevious() {
  const raw = (typeof window !== "undefined" && window.CODEBOOK_PREVIOUS && typeof window.CODEBOOK_PREVIOUS === "object")
    ? window.CODEBOOK_PREVIOUS
    : {};

  const cb = Object.create(null);
  for (const [k, v] of Object.entries(raw)) {
    const split = splitCultureKey(k);
    const key = split.code;
    const label = String(v).trim();
    if (key && label && !(key in cb)) cb[key] = label;
  }
  return cb;
}

export function splitCultureKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return { code: "", precision: "" };
  const [codeRaw, precisionRaw] = raw.split("|");
  const code = String(codeRaw || "").trim().toUpperCase();
  const precision = String(precisionRaw || "").trim();
  return { code, precision };
}

export function buildCultureKey(code, precision) {
  const rawCode = String(code || "").trim().toUpperCase();
  const rawPrecision = String(precision || "").trim();
  if (!rawCode) return "";
  if (!rawPrecision) return rawCode;
  return `${rawCode}|${rawPrecision}`;
}


function normalizePrecisionValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) {
    return String(parseInt(raw, 10));
  }
  return raw;
}

function resolvePrecisionKey(code, precision) {
  const candidate = String(precision || "").trim();
  if (!candidate) return "";

  const list = getPrecisionKeysForCode(code);
  if (!list.length) return candidate;

  if (list.includes(candidate)) return candidate;
  if (/^\d+$/.test(candidate)) {
    const target = normalizePrecisionValue(candidate);
    const match = list.find((p) => /^\d+$/.test(p) && normalizePrecisionValue(p) == target);
    if (match) return match;
  }

  // If precision is explicitly present in source data, keep it as-is.
  return candidate;
}

function buildReverse(cb) {
  const rev = Object.create(null);
  for (const [code, label] of Object.entries(cb)) {
    if (!(label in rev)) rev[label] = code;
  }
  return rev;
}

export function labelFromCode(code, precision) {
  if (!code) return null;
  const cb = readCodebookNow();
  const previousCb = readCodebookPrevious();
  const { code: baseCode, precision: keyPrecision } = splitCultureKey(code);
  const precisionValue = String(precision || keyPrecision || "").trim();
  if (precisionValue) {
    const resolvedPrecision = resolvePrecisionKey(baseCode, precisionValue);
    if (resolvedPrecision) {
      const key = buildCultureKey(baseCode, resolvedPrecision);
      if (cb[key]) return cb[key];
    }
  }
  return cb[baseCode] || previousCb[baseCode] || null;
}

export function codeFromLabel(label) {
  if (!label) return null;
  const cb = readCodebookNow();
  const rev = buildReverse(cb);
  return rev[String(label).trim()] || null;
}

export function getPrecisionKeysForCode(code) {
  const base = String(code || "").trim().toUpperCase();
  if (!base) return [];
  const cb = readCodebookNow();
  const precisions = [];
  for (const key of Object.keys(cb)) {
    const split = splitCultureKey(key);
    if (split.code === base && split.precision) {
      precisions.push(split.precision);
    }
  }
  return precisions
    .filter(Boolean)
    .sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
      return String(a).localeCompare(String(b));
    });
}

export function resolvePrecisionForCode(code, precision) {
  return resolvePrecisionKey(code, precision);
}

export function isPrecisionKnown(code, precision) {
  const list = getPrecisionKeysForCode(code);
  if (!list.length) return false;
  const candidate = String(precision || "").trim();
  if (!candidate) return false;
  if (list.includes(candidate)) return true;
  if (/^\d+$/.test(candidate)) {
    const target = normalizePrecisionValue(candidate);
    return list.some((p) => /^\d+$/.test(p) && normalizePrecisionValue(p) === target);
  }
  return false;
}

export function entriesCodebook() {
  const cb = readCodebookNow();
  const hasPrecision = new Set();
  for (const key of Object.keys(cb)) {
    const split = splitCultureKey(key);
    if (split.precision) {
      hasPrecision.add(split.code);
    }
  }

  const entries = [];
  for (const [key, label] of Object.entries(cb)) {
    const split = splitCultureKey(key);
    if (split.precision) {
      entries.push([key, label]);
    } else if (!hasPrecision.has(split.code)) {
      entries.push([key, label]);
    }
  }

  return entries.sort((a, b) => a[1].localeCompare(b[1]));
}

function getPrecisionFromProps(props = {}) {
  const keys = [
    "precision","precision_n","precision_n0","precision_n_0",
    "precision_n1","precision_n2","precision_n3","precision_n4","precision_n5","precision_n6",
  ];
  for (const key of keys) {
    const value = props[key];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

export function detectCultureCode(props = {}) {
  const codeLike = [
    "CODE_CULTURE","CODE_CULTU","CULT_CODE","CODE","CODE_CULT",
    "CODE_CULTUR","CULTURE_CODE","CD_CULT","CULT","code_culture","code_cult",
    "CULTURE","culture","cultureN","cultureN_1","culture_prec"
  ];
  const looksLikeCode = (value) => {
    if (value == null) return false;
    const trimmed = String(value).trim();
    if (!trimmed) return false;
    const { code } = splitCultureKey(trimmed);
    if (/^[A-Z0-9]{2,10}$/.test(code)) return code;
    return false;
  };
  for (const k of codeLike) {
    const code = looksLikeCode(props[k]);
    if (code) return code;
  }
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (/code.*cult|cult.*code|^code_.*cult/i.test(k)) {
      const code = looksLikeCode(v);
      if (code) return code;
    }
  }
  return null;
}

export function displayLabelFromProps(props = {}) {
  const code = detectCultureCode(props);
  if (code) {
    const precision = getPrecisionFromProps(props);
    return labelFromCode(code, precision) || code;
  }

  const DIRECT_KEYS = [
    "LIB_CULTURE","LIB_CULTU","LIBELLE_CULTURE","NOM_CULTURE","LIB_LONG","LIBELLE",
    "CULTURE","culture","CULT_NOM","CULT_LIB","INTITULE","INTITULE_CULTURE",
    "cultureN","cultureN_1"
  ];
  for (const k of DIRECT_KEYS) {
    const v = props[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "(inconnu)";
}

