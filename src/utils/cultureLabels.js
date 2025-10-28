// src/utils/cultureLabels.js

function readCodebookNow() {
  const raw = (typeof window !== "undefined" && window.CODEBOOK_EXTRA && typeof window.CODEBOOK_EXTRA === "object")
    ? window.CODEBOOK_EXTRA
    : {};

  // Normalise: clés (codes) en MAJUSCULES, tout trim
  const cb = Object.create(null);
  for (const [k, v] of Object.entries(raw)) {
    const code = String(k).trim().toUpperCase();
    const label = String(v).trim();
    if (code) cb[code] = label;
  }
  return cb;
}

function buildReverse(cb) {
  const rev = Object.create(null);
  for (const [code, label] of Object.entries(cb)) {
    if (!(label in rev)) rev[label] = code;
  }
  return rev;
}

export function labelFromCode(code) {
  if (!code) return null;
  const cb = readCodebookNow();
  return cb[String(code).trim().toUpperCase()] || null;
}

export function codeFromLabel(label) {
  if (!label) return null;
  const cb = readCodebookNow();
  const rev = buildReverse(cb);
  return rev[String(label).trim()] || null;
}

export function entriesCodebook() {
  // [ [code, label], ... ] trié par label
  const cb = readCodebookNow();
  return Object.entries(cb).sort((a, b) => a[1].localeCompare(b[1]));
}

// Détecte un code culture probable dans des props (uppercased)
export function detectCultureCode(props = {}) {
  const codeLike = [
    "CODE_CULTURE","CODE_CULTU","CULT_CODE","CODE","CODE_CULT",
    "CODE_CULTUR","CULTURE_CODE","CD_CULT","CULT","code_culture","code_cult",
    "CULTURE","culture"
  ];
  const looksLikeCode = (value) => {
    if (value == null) return false;
    const trimmed = String(value).trim();
    if (!trimmed) return false;
    const upper = trimmed.toUpperCase();
    if (/^[A-Z0-9]{2,10}$/.test(upper)) return upper;
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

// Affichage pour RPG (tooltip) : libellé si connu, sinon le code, sinon "(inconnu)"
export function displayLabelFromProps(props = {}) {
  const code = detectCultureCode(props);
  if (code) return labelFromCode(code) || code;

  const DIRECT_KEYS = [
    "LIB_CULTURE","LIB_CULTU","LIBELLE_CULTURE","NOM_CULTURE","LIB_LONG","LIBELLE",
    "CULTURE","culture","CULT_NOM","CULT_LIB","INTITULE","INTITULE_CULTURE"
  ];
  for (const k of DIRECT_KEYS) {
    const v = props[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "(inconnu)";
}
