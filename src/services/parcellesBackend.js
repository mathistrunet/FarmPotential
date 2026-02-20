const PARCELLES_ENDPOINT = "/api/parcelles";
const MATCH_VALIDATE_ENDPOINT = "/api/parcelles/matching/validate";
const LOCAL_STORAGE_KEY = "parcelles.geojson";

const normalizeFeature = (feature) => {
  if (!feature || typeof feature !== "object") return null;
  if (feature.type !== "Feature") return null;
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
  } catch (error) {
    console.warn("[PARCELLES_LOCAL_READ_FAILED] Lecture localStorage impossible.", error);
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
  } catch (error) {
    console.warn("[PARCELLES_LOCAL_WRITE_FAILED] Écriture localStorage impossible.", error);
  }
};

const clearLocalCollection = () => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (error) {
    console.warn("[PARCELLES_LOCAL_CLEAR_FAILED] Suppression localStorage impossible.", error);
  }
};

export async function fetchParcellesGeojson(signal) {
  try {
    const response = await fetch(PARCELLES_ENDPOINT, { signal });
    if (!response.ok) {
      throw new Error(`[PARCELLES_FETCH_BACKEND_${response.status}] Réponse backend invalide.`);
    }
    const data = await response.json();
    const collection = normalizeFeatureCollection(data);
    persistLocalCollection(collection);
    return collection;
  } catch (error) {
    const local = loadLocalCollection();
    if (local) return local;
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    throw new Error(`[PARCELLES_FETCH_FAILED] Chargement impossible: ${message}`);
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
    throw new Error(`[PARCELLES_CLEAR_BACKEND_${response.status}] Réinitialisation refusée.`);
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
    throw new Error(`[PARCELLES_SAVE_BACKEND_${response.status}] Enregistrement refusé.`);
  }

  return collection;
}

export async function validateParcellesMatching(
  { oldYear, newYear, matches },
  signal
) {
  const response = await fetch(MATCH_VALIDATE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      oldYear,
      newYear,
      matches: Array.isArray(matches) ? matches : [],
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`[PARCELLES_MATCH_VALIDATE_BACKEND_${response.status}] Validation refusée.`);
  }

  return response.json();
}
