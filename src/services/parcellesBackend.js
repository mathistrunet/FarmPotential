const PARCELLES_ENDPOINT = "/api/parcelles";
const LOCAL_STORAGE_KEY = "parcelles.geojson";

const normalizeFeature = (feature) => {
  if (!feature || typeof feature !== "object") {
    return null;
  }
  if (feature.type !== "Feature") {
    return null;
  }
  return {
    ...feature,
    properties: feature.properties || {},
  };
};

const normalizeFeatureCollection = (payload) => {
  const resolveCollection = (candidate) => {
    if (!candidate || typeof candidate !== "object") return null;
    if (candidate.type !== "FeatureCollection") return null;
    if (!Array.isArray(candidate.features)) return null;
    return candidate;
  };

  let collection = resolveCollection(payload);
  if (!collection && payload && typeof payload === "object") {
    collection =
      resolveCollection(payload.data) ||
      resolveCollection(payload.geojson) ||
      resolveCollection(payload.collection);
  }
  if (!collection && Array.isArray(payload?.features)) {
    collection = { type: "FeatureCollection", features: payload.features };
  }
  if (!collection && Array.isArray(payload)) {
    collection = { type: "FeatureCollection", features: payload };
  }

  if (!collection) {
    return { type: "FeatureCollection", features: [] };
  }

  return {
    ...collection,
    features: collection.features.map(normalizeFeature).filter(Boolean),
  };
};

const canUseLocalStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const loadLocalCollection = () => {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    return normalizeFeatureCollection(JSON.parse(raw));
  } catch {
    return null;
  }
};

const persistLocalCollection = (collection) => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify(normalizeFeatureCollection(collection))
    );
  } catch {
    // ignore storage failures
  }
};

const clearLocalCollection = () => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
};

export async function fetchParcellesGeojson(signal) {
  try {
    const response = await fetch(PARCELLES_ENDPOINT, { signal });
    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }
    const data = await response.json();
    const collection = normalizeFeatureCollection(data);
    persistLocalCollection(collection);
    return collection;
  } catch (error) {
    const local = loadLocalCollection();
    if (local) return local;
    throw error;
  }
}

export async function clearParcellesGeojson(signal) {
  const collection = normalizeFeatureCollection({
    type: "FeatureCollection",
    features: [],
  });
  clearLocalCollection();
  const response = await fetch(PARCELLES_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collection),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }

  return collection;
}

export async function saveParcellesGeojson(features, signal) {
  const collection = {
    type: "FeatureCollection",
    features: (features || []).map((feature) => ({
      type: "Feature",
      id: feature.id,
      geometry: feature.geometry,
      properties: feature.properties || {},
    })),
  };

  persistLocalCollection(collection);

  const response = await fetch(PARCELLES_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collection),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }

  return collection;
}
