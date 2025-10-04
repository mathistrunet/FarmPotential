const RAW_GER_COLORBOOK: Record<string, string> = {
  "Lithosols": "#e9e9e9",
  "Régosols": "#eedddc",
  "Rankosols": "#8d8d8d",
  "Arénosols": "#e8e6cb",
  "Peyrosols": "#c5c5c5",
  "Colluviosols": "#b5fc4e",
  "Fluviosols": "#46e7c1",
  "Thalassosols": "#b9fee0",
  "Sodisalisols": "#e3ffbf",
  "Rendisols": "#ffd790",
  "Calcisols": "#ffb62f",
  "Rendosols": "#fffdb9",
  "Calcosols": "#fffc4e",
  "Dolomitosols": "#ffb7b1",
  "Brunisols": "#bc8230",
  "Andosols": "#6e0d00",
  "Vertisols": "#8d8f2a",
  "Organosols": "#3d3d3d",
  "Fersialsols": "#f30012",
  "Néoluvisols": "#d55214",
  "Luvisols": "#efcfae",
  "Véracrisols": "#a2166f",
  "Alocrisols": "#f494fb",
  "Podzosols": "#c526e8",
  "Histosols": "#003894",
  "Réductisols": "#0092fb",
  "Rédoxisols": "#45c6fd",
  "Colluviosols-Rédoxisols": "#189956",
  "Brunisols-Rédoxisols": "#9f5a3c",
  "Néoluvisols-Rédoxisols": "#b6423b",
  "Luvisols-Rédoxisols": "#e3b964",
  "Planosols": "#b790b1",
  "Pélosols": "#9cb7d6",
  "Données non disponibles, en cours d'acquisition": "#a0b5c2",
};

const EXTRA_ALIASES: Record<string, string[]> = {
  "Fluviosols": ["Fluvisols"],
  "Sodisalisols": ["Sodisalsols", "Sodisal sols"],
  "Réductisols": ["Reductisols"],
  "Rédoxisols": ["Redoxisols"],
  "Néoluvisols": ["Neoluvisols"],
  "Véracrisols": ["Veracrisols"],
  "Colluviosols-Rédoxisols": [
    "Colluviosols - Rédoxisols",
    "Colluviosols – Rédoxisols",
    "Colluviosols- Rédoxisols",
    "Colluviosols -Rédoxisols",
    "Colluviosols –Rédoxisols",
  ],
  "Brunisols-Rédoxisols": [
    "Brunisols - Rédoxisols",
    "Brunisols – Rédoxisols",
    "Brunisols- Rédoxisols",
    "Brunisols -Rédoxisols",
  ],
  "Néoluvisols-Rédoxisols": [
    "Néoluvisols - Rédoxisols",
    "Néoluvisols – Rédoxisols",
    "Néoluvisols- Rédoxisols",
    "Néoluvisols -Rédoxisols",
  ],
  "Luvisols-Rédoxisols": [
    "Luvisols - Rédoxisols",
    "Luvisols – Rédoxisols",
    "Luvisols- Rédoxisols",
    "Luvisols -Rédoxisols",
  ],
  "Données non disponibles, en cours d'acquisition": [
    "Donnees non disponibles, en cours d'acquisition",
    "Donnees non disponibles, en cours d\"acquisition",
    "Données non disponibles en cours d'acquisition",
  ],
};

export const GER_NOM_PROPERTY_KEYS = [
  "ger_nom",
  "GER_NOM",
  "Ger_Nom",
  "gerNom",
  "GERnom",
];

const PRE_NORMALIZERS: Array<[string, string]> = [
  [" – ", "-"],
  [" — ", "-"],
  ["‑", "-"],
  [" - ", "-"],
  [" -", "-"],
  ["- ", "-"],
  ["’", "'"],
];

const ACCENT_REPLACEMENTS: Array<[string, string]> = [
  ["À", "A"],
  ["Â", "A"],
  ["Ä", "A"],
  ["Æ", "AE"],
  ["Ç", "C"],
  ["É", "E"],
  ["È", "E"],
  ["Ê", "E"],
  ["Ë", "E"],
  ["Î", "I"],
  ["Ï", "I"],
  ["Ô", "O"],
  ["Ö", "O"],
  ["Ù", "U"],
  ["Û", "U"],
  ["Ü", "U"],
  ["Ÿ", "Y"],
  ["Œ", "OE"],
];

function normalizeLabel(label: string, accentless: boolean): string {
  const withNormalizedHyphen = PRE_NORMALIZERS.reduce(
    (value, [search, replacement]) => value.split(search).join(replacement),
    label
  );
  const collapsedSpaces = withNormalizedHyphen.replace(/\s+/g, " ").trim();
  const upper = collapsedSpaces.toLocaleUpperCase("fr-FR");
  if (!accentless) return upper;
  const accentless = ACCENT_REPLACEMENTS.reduce((value, [search, replacement]) => {
    return value.split(search).join(replacement);
  }, upper);
  return accentless
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildColorPairs(accentless: boolean): Array<[string, string]> {
  const pairs = new Map<string, string>();
  const addEntry = (label: string, color: string) => {
    const key = normalizeLabel(label, accentless);
    if (!pairs.has(key)) {
      pairs.set(key, color);
    }
  };
  for (const [label, color] of Object.entries(RAW_GER_COLORBOOK)) {
    addEntry(label, color);
    EXTRA_ALIASES[label]?.forEach((alias) => addEntry(alias, color));
  }
  return Array.from(pairs.entries());
}

export const GER_NOM_COLOR_MATCH_PAIRS = buildColorPairs(false);
export const GER_NOM_COLOR_MATCH_PAIRS_ASCII = buildColorPairs(true);
export const GER_NOM_PRE_NORMALIZERS = PRE_NORMALIZERS;
export const GER_NOM_ACCENT_REPLACEMENTS = ACCENT_REPLACEMENTS;

export function buildGerNomColorExpression(fallbackColor: string): any[] {
  const baseExpr: any[] = ["coalesce"];
  for (const key of GER_NOM_PROPERTY_KEYS) {
    baseExpr.push(["to-string", ["get", key]]);
  }
  baseExpr.push("");

  let normalized: any = baseExpr;
  for (const [search, replacement] of GER_NOM_PRE_NORMALIZERS) {
    normalized = ["replace", normalized, search, replacement];
  }
  normalized = ["upcase", normalized];

  let asciiExpr: any = normalized;
  for (const [search, replacement] of GER_NOM_ACCENT_REPLACEMENTS) {
    asciiExpr = ["replace", asciiExpr, search, replacement];
  }

  const asciiMatch: any[] = ["match", asciiExpr];
  for (const [key, color] of GER_NOM_COLOR_MATCH_PAIRS_ASCII) {
    asciiMatch.push(key, color);
  }
  asciiMatch.push(fallbackColor);

  const accentMatch: any[] = ["match", normalized];
  for (const [key, color] of GER_NOM_COLOR_MATCH_PAIRS) {
    accentMatch.push(key, color);
  }
  accentMatch.push(asciiMatch);

  return accentMatch;
}

