export const buildStableHash = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const PROPERTY_ALIASES = {
  culture: ["culture", "Culture", "CULTURE", "code_culture", "codeCulture", "code"],
  precedent: [
    "precedent",
    "Precedent",
    "PRECEDENT",
    "precedent_culture",
    "precedentCulture",
  ],
  ilot: ["ilot", "Ilot", "ILOT", "ilot_numero", "numero_ilot", "numeroIlot"],
  exploitation: [
    "exploitation",
    "Exploitation",
    "EXPLOITATION",
    "exploitationId",
    "exploitation_id",
    "id_exploitation",
    "codeExploitation",
  ],
};

const normalizeStringValue = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

const resolvePropertyAlias = (properties, aliases) => {
  for (const alias of aliases) {
    const value = normalizeStringValue(properties?.[alias]);
    if (value != null) return value;
  }
  return null;
};

const resolveSourceCollection = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  if (payload.type === "FeatureCollection" && Array.isArray(payload.features)) {
    return payload;
  }
  if (Array.isArray(payload.features)) {
    return { type: "FeatureCollection", features: payload.features };
  }
  if (Array.isArray(payload)) {
    return { type: "FeatureCollection", features: payload };
  }
  if (payload.data || payload.geojson || payload.collection) {
    return (
      resolveSourceCollection(payload.data) ||
      resolveSourceCollection(payload.geojson) ||
      resolveSourceCollection(payload.collection)
    );
  }
  return null;
};

export const normalizeParcellesCollection = (payload) => {
  const source = resolveSourceCollection(payload) || {
    type: "FeatureCollection",
    features: [],
  };
  const usedIds = new Set();
  const normalizeFeature = (feature, index) => {
    if (!feature || feature.type !== "Feature") return null;
    const properties = feature.properties || {};
    const normalized = { ...properties };
    const culture = resolvePropertyAlias(properties, PROPERTY_ALIASES.culture);
    const precedent = resolvePropertyAlias(properties, PROPERTY_ALIASES.precedent);
    const ilot = resolvePropertyAlias(properties, PROPERTY_ALIASES.ilot);
    const exploitation = resolvePropertyAlias(properties, PROPERTY_ALIASES.exploitation);
    if (culture != null) normalized.culture = culture;
    if (precedent != null) normalized.precedent = precedent;
    if (ilot != null) normalized.ilot = ilot;
    if (exploitation != null) {
      normalized.exploitation = exploitation;
      if (normalized.exploitationId == null) {
        normalized.exploitationId = exploitation;
      }
    }
    const baseId =
      feature.id ??
      normalized.id ??
      `parcelle-${buildStableHash({
        geometry: feature.geometry,
        nom: normalized.nom ?? normalized.nom_affiche ?? "",
        ilot: normalized.ilot ?? "",
      })}`;
    let nextId = String(baseId);
    if (usedIds.has(nextId)) {
      nextId = `${nextId}-${index}`;
    }
    usedIds.add(nextId);

    return {
      ...feature,
      id: nextId,
      properties: {
        ...normalized,
        id: normalized.id ?? nextId,
      },
    };
  };

  return {
    type: "FeatureCollection",
    features: source.features.map(normalizeFeature).filter(Boolean),
  };
};
