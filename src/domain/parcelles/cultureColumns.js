// src/domain/parcelles/cultureColumns.js
//
// Description unique des colonnes de cultures (N+1 … N-6).
//
// Pourquoi ce module : la même culture est stockée sous des clés différentes
// selon la provenance de la parcelle — `cultureN1` pour un import Télépac XML,
// `culture_prec` pour un shapefile, `cultureN_1` pour un CSV Assolia, `precedent`
// pour de vieux fichiers. Tant que chaque fonction portait sa propre liste
// d'alias, certaines lisaient une clé que d'autres n'écrivaient pas : le tableau
// affichait une valeur que « Déplacer cultures » croyait absente, et l'effaçait.
//
// Règle : on LIT large (`readKeys`, alias hérités compris) et on ÉCRIT toujours
// le même jeu canonique (`writeKeys`), pour que la donnée reste visible quelle
// que soit la fonction qui la relit ensuite.

/** Colonnes, de la plus récente à la plus ancienne (ordre d'affichage). */
export const CULTURE_COLUMNS = [
  {
    id: "next1",
    label: "Culture N+1",
    offset: 1,
    writeKeys: ["cultureN_plus1", "cultureN+1", "cultureN_+1"],
    readKeys: ["cultureN_plus1", "cultureN+1", "cultureN_+1", "cultureNplus1", "culture_n_plus1"],
    precisionKey: "precision_n_plus1",
    precisionReadKeys: ["precision_n_plus1", "precision_n_plus_1", "precision_nplus1"],
  },
  {
    id: "current",
    label: "Culture N",
    offset: 0,
    writeKeys: ["cultureN", "cultureN_0", "cultureN0", "culture", "code", "code_culture", "CP_CULTU"],
    readKeys: [
      "cultureN", "cultureN_0", "cultureN0", "culture", "code", "code_culture", "CP_CULTU",
      "Culture", "CULTURE", "codeCulture", "CODE_CULTURE", "CODE_CULTU", "cp_cultu",
    ],
    precisionKey: "precision",
    precisionReadKeys: ["precision", "precision_n", "precision_n0", "precision_n_0"],
  },
  {
    id: "prev1",
    label: "Culture N-1",
    offset: -1,
    writeKeys: ["cultureN_1", "cultureN1", "culture_prec", "CULT_PREC"],
    readKeys: [
      "cultureN_1", "cultureN1", "culture_prec", "CULT_PREC", "cultureN-1", "culturePrec",
      "cult_prec", "precedent", "Precedent", "PRECEDENT", "precedent_culture", "precedentCulture",
    ],
    precisionKey: "precision_n1",
    precisionReadKeys: ["precision_n1", "precision_n_1"],
  },
  {
    id: "prev2",
    label: "Culture N-2",
    offset: -2,
    writeKeys: ["cultureN_2", "cultureN2", "culture_prec2", "CULT_PREC2"],
    readKeys: [
      "cultureN_2", "cultureN2", "culture_prec2", "CULT_PREC2", "cultureN-2", "cult_prec2",
      "precedent_N2", "precedentN2", "precedent_n2",
    ],
    precisionKey: "precision_n2",
    precisionReadKeys: ["precision_n2", "precision_n_2"],
  },
  {
    id: "prev3",
    label: "Culture N-3",
    offset: -3,
    writeKeys: ["cultureN_3", "cultureN3", "culture_prec3", "CULT_PREC3"],
    readKeys: ["cultureN_3", "cultureN3", "culture_prec3", "CULT_PREC3", "cultureN-3", "cult_prec3"],
    precisionKey: "precision_n3",
    precisionReadKeys: ["precision_n3", "precision_n_3"],
  },
  {
    id: "prev4",
    label: "Culture N-4",
    offset: -4,
    writeKeys: ["cultureN_4", "cultureN4", "culture_prec4", "CULT_PREC4"],
    readKeys: ["cultureN_4", "cultureN4", "culture_prec4", "CULT_PREC4", "cultureN-4", "cult_prec4"],
    precisionKey: "precision_n4",
    precisionReadKeys: ["precision_n4", "precision_n_4"],
  },
  {
    id: "prev5",
    label: "Culture N-5",
    offset: -5,
    writeKeys: ["cultureN_5", "cultureN5", "culture_prec5", "CULT_PREC5"],
    readKeys: ["cultureN_5", "cultureN5", "culture_prec5", "CULT_PREC5", "cultureN-5", "cult_prec5"],
    precisionKey: "precision_n5",
    precisionReadKeys: ["precision_n5", "precision_n_5"],
  },
  {
    id: "prev6",
    label: "Culture N-6",
    offset: -6,
    writeKeys: ["cultureN_6", "cultureN6", "culture_prec6", "CULT_PREC6"],
    readKeys: ["cultureN_6", "cultureN6", "culture_prec6", "CULT_PREC6", "cultureN-6", "cult_prec6"],
    precisionKey: "precision_n6",
    precisionReadKeys: ["precision_n6", "precision_n_6"],
  },
];

const BY_ID = new Map(CULTURE_COLUMNS.map((col) => [col.id, col]));
const BY_OFFSET = new Map(CULTURE_COLUMNS.map((col) => [col.offset, col]));

/** Colonne décrite par son identifiant (`prev1`…), ou `null`. */
export const getCultureColumn = (id) => BY_ID.get(id) ?? null;

/** Colonne d'un décalage d'années donné (0 = N, -1 = N-1…), ou `null`. */
export const getCultureColumnByOffset = (offset) => BY_OFFSET.get(offset) ?? null;

const isFilled = (value) => value != null && String(value).trim() !== "";

const firstFilled = (props, keys) => {
  for (const key of keys) {
    const value = props?.[key];
    if (isFilled(value)) return String(value).trim();
  }
  return "";
};

/**
 * Valeur de culture d'une colonne, quel que soit l'alias sous lequel l'import
 * l'a rangée. Retourne `""` si la colonne est vide.
 */
export const readCultureValue = (props, column) =>
  column ? firstFilled(props, column.readKeys) : "";

/** Précision associée à une colonne, `""` si absente. */
export const readCulturePrecision = (props, column) =>
  column ? firstFilled(props, column.precisionReadKeys) : "";

/** `true` si la colonne porte une valeur, sous n'importe lequel de ses alias. */
export const hasCultureValue = (props, column) => readCultureValue(props, column) !== "";

/**
 * Efface une colonne : tous les alias connus, y compris hérités, sinon une
 * ancienne clé ressortirait à la lecture suivante comme si rien n'avait été fait.
 * Retourne un nouvel objet de propriétés.
 */
export const clearCulture = (props, column) => {
  const next = { ...(props || {}) };
  if (!column) return next;
  column.readKeys.forEach((key) => { delete next[key]; });
  column.precisionReadKeys.forEach((key) => { delete next[key]; });
  return next;
};

/**
 * Écrit une colonne sous toutes ses clés canoniques et purge les alias hérités
 * qui porteraient encore l'ancienne valeur. Une valeur vide efface la colonne.
 * Retourne un nouvel objet de propriétés.
 */
export const setCulture = (props, column, value, precision = "") => {
  if (!column) return { ...(props || {}) };
  const text = value == null ? "" : String(value).trim();
  const next = clearCulture(props, column);
  if (!text) return next;
  column.writeKeys.forEach((key) => { next[key] = text; });
  const precisionText = precision == null ? "" : String(precision).trim();
  if (precisionText) next[column.precisionKey] = precisionText;
  return next;
};
