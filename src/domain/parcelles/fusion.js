import { getFeatureKey } from "../../utils/parcelleMatching.js";

export const PRECEDENT_N1_FIELDS = [
  "precedent",
  "Precedent",
  "PRECEDENT",
  "precedent_culture",
  "precedentCulture",
  "culture_prec",
  "culturePrec",
  "cultureN_1",
  "cultureN1",
  "cultureN-1",
];

export const PRECEDENT_N2_FIELDS = [
  "precedent_N2",
  "precedentN2",
  "precedent_n2",
  "cultureN_2",
  "cultureN2",
  "cultureN-2",
];

export const DEFAULT_PRECEDENT_N2_FIELD = "precedent_N2";
export const DEFAULT_PRECEDENT_N1_FIELD = "precedent";

const CULTURE_FIELDS = [
  "culture",
  "Culture",
  "CULTURE",
  "cultureN",
  "cultureN_0",
  "cultureN0",
  "code_culture",
  "codeCulture",
  "code",
];

const normalizeValue = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

const resolvePropertyKey = (properties, key) => {
  if (!properties || !key) return null;
  if (Object.prototype.hasOwnProperty.call(properties, key)) {
    return normalizeValue(properties[key]);
  }
  const lowered = String(key).toLowerCase();
  const matched = Object.keys(properties).find(
    (prop) => prop.toLowerCase() === lowered
  );
  if (!matched) return null;
  return normalizeValue(properties[matched]);
};

const findExistingPropertyKey = (properties, fields) => {
  if (!properties) return null;
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(properties, field)) return field;
    const lowered = field.toLowerCase();
    const matched = Object.keys(properties).find(
      (prop) => prop.toLowerCase() === lowered
    );
    if (matched) return matched;
  }
  return null;
};

const findFirstValue = (properties, fields) => {
  for (const field of fields) {
    const value = resolvePropertyKey(properties, field);
    if (value != null) return value;
  }
  return null;
};

const isEmptyValue = (value) => {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
};

const mergeParcelleProperties = (newProps, oldProps) => {
  const merged = { ...(oldProps || {}) };
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

export const getOldYearPrevious = (oldFeature) => {
  const properties = oldFeature?.properties || null;
  if (!properties) return null;
  return (
    findFirstValue(properties, PRECEDENT_N1_FIELDS) ??
    findFirstValue(properties, PRECEDENT_N2_FIELDS)
  );
};

export const getOldYearCulture = (oldFeature) => {
  const properties = oldFeature?.properties || null;
  if (!properties) return null;
  return findFirstValue(properties, CULTURE_FIELDS);
};

export const getTargetPreviousField = (newFeature) => {
  const properties = newFeature?.properties || null;
  return (
    findExistingPropertyKey(properties, PRECEDENT_N2_FIELDS) ||
    DEFAULT_PRECEDENT_N2_FIELD
  );
};

export const getTargetPreviousFieldN1 = (newFeature) => {
  const properties = newFeature?.properties || null;
  return (
    findExistingPropertyKey(properties, PRECEDENT_N1_FIELDS) ||
    DEFAULT_PRECEDENT_N1_FIELD
  );
};

export const resolvePreviousDisplayValue = (properties) =>
  findFirstValue(properties, PRECEDENT_N2_FIELDS) ??
  findFirstValue(properties, PRECEDENT_N1_FIELDS);

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

    const oldCulture = getOldYearCulture(oldFeature);
    const oldPrevious = getOldYearPrevious(oldFeature, oldYear, newYear);
    const mergedProperties = mergeParcelleProperties(
      newFeature.properties || {},
      oldFeature.properties || {}
    );
    if (oldCulture != null) {
      const targetField = getTargetPreviousFieldN1(newFeature);
      if (resolvePropertyKey(mergedProperties, targetField) == null) {
        mergedProperties[targetField] = oldCulture;
      }
    }
    if (oldPrevious != null) {
      const targetField = getTargetPreviousField(newFeature, oldYear, newYear);
      if (resolvePropertyKey(mergedProperties, targetField) == null) {
        mergedProperties[targetField] = oldPrevious;
      }
    }

    updatedNew.set(String(newKey), {
      ...newFeature,
      properties: {
        ...mergedProperties,
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
