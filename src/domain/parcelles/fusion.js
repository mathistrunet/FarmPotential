import { getFeatureKey } from "../../utils/parcelleMatching.js";
import {
  CULTURE_COLUMNS,
  getCultureColumn,
  readCulturePrecision,
  readCultureValue,
  setCulture,
} from "./cultureColumns.js";

// ---------------------------------------------------------------------------
// Fusion de deux millésimes
//
// Convention : les colonnes N+1 … N-6 sont communes à tout le parcellaire, pas
// propres à chaque parcelle. C'est l'utilisateur qui range chaque millésime dans
// la bonne colonne, à l'import ou avec « Déplacer cultures » ; la comparaison ne
// fait que verser les colonnes de la parcelle qui disparaît dans celles de la
// parcelle conservée, **sans rien décaler**. Une culture placée en N-1 avant la
// comparaison reste en N-1 après.
//
// Ce point a été corrigé deux fois. Le code d'origine mélangeait une recopie
// brute des propriétés (sans décalage) et une écriture de la culture ancienne en
// N-1 (avec décalage) : la même colonne recevait deux valeurs d'années
// différentes sous deux alias distincts. La correction suivante a tout décalé de
// l'écart entre les millésimes, ce qui déplaçait en N-2 une culture rangée en
// N-1 à la main. Seule la règle « aucun décalage » respecte le rangement choisi.
//
// Colonne déjà renseignée dans la parcelle conservée : elle est gardée, la
// valeur de la parcelle qui disparaît est signalée au lieu d'écraser une saisie.
// ---------------------------------------------------------------------------

/** Toutes les clés de culture et de précision, quel que soit l'alias. */
const CULTURE_PROPERTY_KEYS = new Set(
  CULTURE_COLUMNS.flatMap((col) => [...col.readKeys, ...col.precisionReadKeys])
);

const normalizeValue = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

const isEmptyValue = (value) => {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
};

/**
 * Fusionne les attributs NON culturaux : la parcelle conservée garde les siens,
 * l'ancienne ne sert qu'à combler les trous (nom, îlot, type de sol…).
 * Les colonnes de cultures sont volontairement exclues : elles sont replacées
 * ensuite, décalées du bon nombre d'années.
 */
const mergeParcelleProperties = (newProps, oldProps) => {
  const merged = {};
  Object.entries(oldProps || {}).forEach(([key, value]) => {
    if (CULTURE_PROPERTY_KEYS.has(key)) return;
    merged[key] = value;
  });
  Object.entries(newProps || {}).forEach(([key, value]) => {
    if (isEmptyValue(value)) {
      if (!Object.prototype.hasOwnProperty.call(merged, key)) {
        merged[key] = value;
      }
      return;
    }
    merged[key] = value;
  });
  return merged;
};

const defaultWarn = (message, meta) => {
  if (typeof import.meta !== "undefined" && import.meta?.env?.DEV) {
    console.warn(message, meta);
  }
};

export const getFeatureId = (feature) =>
  feature?.id ?? feature?.properties?.__id ?? feature?.properties?.id;

export const buildParcellesByYearFromFeatures = (features) => {
  const grouped = {};
  (features || []).forEach((feature) => {
    const year = Number(feature?.properties?.annee);
    if (!Number.isFinite(year)) return;
    if (!grouped[year]) {
      grouped[year] = { type: "FeatureCollection", features: [] };
    }
    grouped[year].features.push(feature);
  });
  return grouped;
};

/** Culture de l'année de la parcelle (colonne N), `null` si absente. */
export const getOldYearCulture = (oldFeature) =>
  normalizeValue(readCultureValue(oldFeature?.properties, getCultureColumn("current")));

/** Antécédent le plus récent de la parcelle (N-1, à défaut N-2). */
export const getOldYearPrevious = (oldFeature) => {
  const props = oldFeature?.properties;
  return (
    normalizeValue(readCultureValue(props, getCultureColumn("prev1"))) ??
    normalizeValue(readCultureValue(props, getCultureColumn("prev2")))
  );
};

/** Valeur de précédent à afficher dans une infobulle de carte. */
export const resolvePreviousDisplayValue = (properties) =>
  normalizeValue(readCultureValue(properties, getCultureColumn("prev1"))) ??
  normalizeValue(readCultureValue(properties, getCultureColumn("prev2")));

/**
 * Verse les colonnes de cultures de `oldProps` dans `baseProps`, colonne pour
 * colonne : N reste en N, N-1 reste en N-1. Une colonne déjà renseignée dans la
 * parcelle conservée n'est pas touchée, le conflit est signalé.
 */
const transferCultureHistory = (baseProps, oldProps, warn, context) => {
  let merged = baseProps;
  CULTURE_COLUMNS.forEach((column) => {
    const value = readCultureValue(oldProps, column);
    if (!value) return;

    const existing = readCultureValue(merged, column);
    if (existing) {
      if (existing !== value) {
        warn("Fusion millésimes : colonne déjà renseignée, valeur non reportée.", {
          ...context,
          colonne: column.label,
          conservee: existing,
          ignoree: value,
        });
      }
      return;
    }
    merged = setCulture(merged, column, value, readCulturePrecision(oldProps, column));
  });
  return merged;
};

/**
 * Applique les correspondances validées : chaque parcelle de `oldYear` verse ses
 * colonnes de cultures dans la parcelle de `newYear` qui lui est associée, puis
 * disparaît. Les colonnes ne bougent pas d'un cran.
 *
 * Retourne `{ parcellesByYear, removedOldKeys, updatedNewByKey, error }`.
 * `error` est renseigné — et rien n'est modifié — si les deux années sont la
 * même, cas où il n'y a rien à fusionner.
 */
export const applyCorrespondencesAndMerge = ({
  parcellesByYear,
  oldYear,
  newYear,
  correspondancesValidated,
  dropOldYear = false,
  onWarning,
}) => {
  const warn = typeof onWarning === "function" ? onWarning : defaultWarn;
  const current = parcellesByYear || {};
  const oldCollection = current?.[oldYear];
  const newCollection = current?.[newYear];
  if (!oldCollection || !newCollection) {
    return { parcellesByYear: current };
  }

  // Aucune contrainte d'ordre entre les deux années : les colonnes ne sont pas
  // décalées, fusionner un millésime plus récent dans un plus ancien reste
  // cohérent. Seule la fusion d'une année avec elle-même n'a pas de sens.
  if (String(oldYear) === String(newYear)) {
    const error = "L'année conservée et l'année qui disparaît sont identiques.";
    warn(`Fusion millésimes : ${error}`, { oldYear, newYear });
    return { parcellesByYear: current, error };
  }

  const oldFeatures = Array.isArray(oldCollection.features) ? oldCollection.features : [];
  const newFeatures = Array.isArray(newCollection.features) ? newCollection.features : [];
  const oldByKey = new Map(
    oldFeatures.map((feature, index) => [getFeatureKey(feature, index), feature])
  );
  const newByKey = new Map(
    newFeatures.map((feature, index) => [getFeatureKey(feature, index), feature])
  );
  const removedOldKeys = new Set();
  const updatedNew = new Map();
  const newKeySources = new Map();

  Object.entries(correspondancesValidated || {}).forEach(([oldKey, newKey]) => {
    if (!oldKey || !newKey) return;
    const oldFeature = oldByKey.get(String(oldKey));
    if (!oldFeature) {
      warn("Fusion correspondances: parcelle ancienne introuvable.", { oldKey });
      return;
    }
    const newFeature = newByKey.get(String(newKey));
    if (!newFeature) {
      warn("Fusion correspondances: parcelle récente introuvable.", { newKey });
      return;
    }
    if (newKeySources.has(newKey)) {
      warn("Fusion correspondances: plusieurs anciennes vers la même récente.", {
        newKey,
        previousOldKey: newKeySources.get(newKey),
        oldKey,
      });
    }
    newKeySources.set(newKey, oldKey);

    const oldProps = oldFeature.properties || {};
    // La parcelle conservée peut déjà avoir servi de cible : on repart de sa
    // version fusionnée, sinon la seconde fusion écraserait la première.
    const baseFeature = updatedNew.get(String(newKey)) ?? newFeature;
    let mergedProperties = mergeParcelleProperties(baseFeature.properties || {}, oldProps);
    mergedProperties = transferCultureHistory(mergedProperties, oldProps, warn, {
      oldYear,
      newYear,
      oldKey,
      newKey,
    });

    updatedNew.set(String(newKey), {
      ...newFeature,
      properties: {
        ...mergedProperties,
        annee: newFeature.properties?.annee ?? newYear,
        matchMergedFromYear: oldYear,
      },
    });
    removedOldKeys.add(String(oldKey));
  });

  const nextOldFeatures = oldFeatures.filter((feature, index) => {
    const key = getFeatureKey(feature, index);
    return !removedOldKeys.has(String(key));
  });
  const nextNewFeatures = newFeatures.map((feature, index) => {
    const key = getFeatureKey(feature, index);
    return updatedNew.get(String(key)) ?? feature;
  });

  return {
    parcellesByYear: {
      ...current,
      [oldYear]: {
        ...oldCollection,
        features: dropOldYear ? [] : nextOldFeatures,
      },
      [newYear]: { ...newCollection, features: nextNewFeatures },
    },
    removedOldKeys,
    updatedNewByKey: updatedNew,
  };
};
