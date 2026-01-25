import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { fetchParcellesGeojson } from "../../services/parcellesBackend";
import { normalizeParcellesCollection } from "./parcellesData";

const ParcellesContext = createContext(null);
const EMPTY_COLLECTION = { type: "FeatureCollection", features: [] };
const LOCAL_STORAGE_KEY = "farmpotential.parcelles-temp";

const readFromStorage = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Impossible de lire les parcelles depuis le stockage local.", error);
    return null;
  }
};

const writeToStorage = (payload) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Impossible d'écrire les parcelles dans le stockage local.", error);
  }
};

export function ParcellesProvider({ children, initialCollection }) {
  const [parcellesCollection, setParcellesCollectionState] = useState(() =>
    normalizeParcellesCollection(initialCollection || EMPTY_COLLECTION)
  );
  const [loading, setLoading] = useState(!initialCollection);
  const [error, setError] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [hydratedFromStorage, setHydratedFromStorage] = useState(false);

  const setParcellesCollection = useCallback((next) => {
    setParcellesCollectionState(normalizeParcellesCollection(next));
    setLastUpdatedAt(Date.now());
    setIsDirty(true);
  }, []);

  const setFeatureCollection = useCallback((next, { dirty = true } = {}) => {
    setParcellesCollectionState(normalizeParcellesCollection(next));
    setLastUpdatedAt(Date.now());
    if (dirty) {
      setIsDirty(true);
    }
  }, []);

  const refreshParcelles = useCallback(async (signal) => {
    setLoading(true);
    try {
      const collection = await fetchParcellesGeojson(signal);
      setParcellesCollectionState(normalizeParcellesCollection(collection));
      setError(null);
      setLastUpdatedAt(Date.now());
      setIsDirty(false);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialCollection) return undefined;
    const stored = readFromStorage();
    if (stored) {
      setParcellesCollectionState(normalizeParcellesCollection(stored));
      setLoading(false);
      setHydratedFromStorage(true);
    }
    return undefined;
  }, [initialCollection]);

  useEffect(() => {
    if (initialCollection) return undefined;
    if (hydratedFromStorage) return undefined;
    const controller = new AbortController();
    refreshParcelles(controller.signal);
    return () => controller.abort();
  }, [initialCollection, hydratedFromStorage, refreshParcelles]);

  useEffect(() => {
    if (!parcellesCollection) return undefined;
    const timeout = setTimeout(() => {
      writeToStorage(parcellesCollection);
    }, 250);
    return () => clearTimeout(timeout);
  }, [parcellesCollection]);

  const setFromTelepac = useCallback((next) => {
    setFeatureCollection(next);
  }, [setFeatureCollection]);

  const upsertFeature = useCallback((feature) => {
    if (!feature) return;
    setParcellesCollectionState((prev) => {
      const safePrev = normalizeParcellesCollection(prev || EMPTY_COLLECTION);
      const filtered = safePrev.features.filter((item) => item.id !== feature.id);
      return normalizeParcellesCollection({
        type: "FeatureCollection",
        features: [...filtered, feature],
      });
    });
    setLastUpdatedAt(Date.now());
    setIsDirty(true);
  }, []);

  const updateFeatureProps = useCallback((id, partialProps) => {
    if (!id || !partialProps) return;
    setParcellesCollectionState((prev) => {
      const safePrev = normalizeParcellesCollection(prev || EMPTY_COLLECTION);
      const nextFeatures = safePrev.features.map((feature) => {
        if (feature.id !== id) return feature;
        return {
          ...feature,
          properties: {
            ...(feature.properties || {}),
            ...partialProps,
          },
        };
      });
      return normalizeParcellesCollection({
        type: "FeatureCollection",
        features: nextFeatures,
      });
    });
    setLastUpdatedAt(Date.now());
    setIsDirty(true);
  }, []);

  const updateFeatureGeometry = useCallback((id, geometry) => {
    if (!id || !geometry) return;
    setParcellesCollectionState((prev) => {
      const safePrev = normalizeParcellesCollection(prev || EMPTY_COLLECTION);
      const nextFeatures = safePrev.features.map((feature) => {
        if (feature.id !== id) return feature;
        return { ...feature, geometry };
      });
      return normalizeParcellesCollection({
        type: "FeatureCollection",
        features: nextFeatures,
      });
    });
    setLastUpdatedAt(Date.now());
    setIsDirty(true);
  }, []);

  const reset = useCallback(() => {
    setParcellesCollectionState(normalizeParcellesCollection(EMPTY_COLLECTION));
    setLastUpdatedAt(Date.now());
    setIsDirty(true);
  }, []);

  const value = useMemo(
    () => ({
      parcellesCollection,
      setParcellesCollection,
      setFeatureCollection,
      setFromTelepac,
      upsertFeature,
      updateFeatureProps,
      updateFeatureGeometry,
      reset,
      loading,
      error,
      refreshParcelles,
      lastUpdatedAt,
      isDirty,
    }),
    [
      parcellesCollection,
      setParcellesCollection,
      setFeatureCollection,
      setFromTelepac,
      upsertFeature,
      updateFeatureProps,
      updateFeatureGeometry,
      reset,
      loading,
      error,
      refreshParcelles,
      lastUpdatedAt,
      isDirty,
    ]
  );

  return <ParcellesContext.Provider value={value}>{children}</ParcellesContext.Provider>;
}

export function useParcelles() {
  const context = useContext(ParcellesContext);
  if (!context) {
    throw new Error("useParcelles must be used within ParcellesProvider");
  }
  return context;
}
