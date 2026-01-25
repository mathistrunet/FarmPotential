const buildStableHash = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
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
    const baseId =
      feature.id ??
      properties.id ??
      `parcelle-${buildStableHash({
        geometry: feature.geometry,
        nom: properties.nom ?? properties.nom_affiche ?? "",
        ilot: properties.ilot ?? "",
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
        ...properties,
        id: properties.id ?? nextId,
      },
    };
  };

  return {
    type: "FeatureCollection",
    features: source.features.map(normalizeFeature).filter(Boolean),
  };
};
