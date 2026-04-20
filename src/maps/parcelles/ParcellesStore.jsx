import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchParcellesGeojson } from "../../services/parcellesBackend";
import { normalizeParcellesCollection } from "./parcellesData";

import { ParcellesContext } from "./ParcellesContext";
const EMPTY_COLLECTION = { type: "FeatureCollection", features: [] };

// Lightweight structural equality — avoids full JSON.stringify on large GeoJSON.
// Compares geometry by reference first (same ref = unchanged), then serializes
// only properties (small) + falls back to coordinate serialization only when needed.
function featureCollectionsEqual(a, b) {
  if (a === b) return true;
  const af = a.features;
  const bf = b.features;
  if (af.length !== bf.length) return false;
  for (let i = 0; i < af.length; i++) {
    const fa = af[i];
    const fb = bf[i];
    if (fa === fb) continue;
    if (fa.id !== fb.id) return false;
    if (fa.geometry !== fb.geometry &&
        JSON.stringify(fa.geometry) !== JSON.stringify(fb.geometry)) return false;
    if (JSON.stringify(fa.properties) !== JSON.stringify(fb.properties)) return false;
  }
  return true;
}
const LOCAL_STORAGE_KEY = "farmpotential.parcelles-temp";

const readFromStorage = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("[PARCELLES_TEMP_READ_FAILED] Lecture stockage local impossible.", error);
    return null;
  }
};

const writeToStorage = (payload) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[PARCELLES_TEMP_WRITE_FAILED] Écriture stockage local impossible.", error);
  }
};

export function ParcellesProvider({ children, initialCollection }) {
  const [parcellesCollection, setParcellesCollectionState] = useState(() =>
    normalizeParcellesCollection(initialCollection || EMPTY_COLLECTION)
  );
  const [historyPast, setHistoryPast] = useState([]);
  const [historyFuture, setHistoryFuture] = useState([]);
  const [loading, setLoading] = useState(!initialCollection);
  const [error, setError] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [hydratedFromStorage, setHydratedFromStorage] = useState(false);

  const setCollectionState = useCallback((next, { dirty = true, trackHistory = true } = {}) => {
    setParcellesCollectionState((prev) => {
      // prev is always normalized (all write paths go through normalizeParcellesCollection)
      const safePrev = prev || EMPTY_COLLECTION;
      const safeNext = normalizeParcellesCollection(
        typeof next === "function" ? next(safePrev) : next
      );
      if (featureCollectionsEqual(safePrev, safeNext)) {
        return safePrev;
      }
      if (trackHistory) {
        setHistoryPast((current) => [...current, safePrev].slice(-50));
        setHistoryFuture([]);
      }
      return safeNext;
    });
    setLastUpdatedAt(Date.now());
    if (dirty) {
      setIsDirty(true);
    }
  }, []);

  const setParcellesCollection = useCallback((next) => {
    setCollectionState(next);
  }, [setCollectionState]);

  const setFeatureCollection = useCallback((next, { dirty = true } = {}) => {
    setCollectionState(next, { dirty, trackHistory: dirty });
  }, [setCollectionState]);

  const refreshParcelles = useCallback(async (signal) => {
    setLoading(true);
    try {
      const collection = await fetchParcellesGeojson(signal);
      setParcellesCollectionState(normalizeParcellesCollection(collection));
      setHistoryPast([]);
      setHistoryFuture([]);
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
      setHistoryPast([]);
      setHistoryFuture([]);
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
    setCollectionState((prev) => {
      const safePrev = normalizeParcellesCollection(prev || EMPTY_COLLECTION);
      const filtered = safePrev.features.filter((item) => item.id !== feature.id);
      return normalizeParcellesCollection({
        type: "FeatureCollection",
        features: [...filtered, feature],
      });
    });
  }, [setCollectionState]);

  const updateFeatureProps = useCallback((id, partialProps) => {
    if (!id || !partialProps) return;
    setCollectionState((prev) => {
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
  }, [setCollectionState]);

  const updateFeatureGeometry = useCallback((id, geometry) => {
    if (!id || !geometry) return;
    setCollectionState((prev) => {
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
  }, [setCollectionState]);

  const reset = useCallback(() => {
    setCollectionState(EMPTY_COLLECTION);
  }, [setCollectionState]);

  const undo = useCallback(() => {
    if (!historyPast.length) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast((current) => current.slice(0, -1));
    setHistoryFuture((current) => [normalizeParcellesCollection(parcellesCollection), ...current].slice(0, 50));
    setParcellesCollectionState(normalizeParcellesCollection(previous));
    setLastUpdatedAt(Date.now());
    setIsDirty(true);
  }, [historyPast, parcellesCollection]);

  const redo = useCallback(() => {
    if (!historyFuture.length) return;
    const [next, ...rest] = historyFuture;
    setHistoryFuture(rest);
    setHistoryPast((current) => [...current, normalizeParcellesCollection(parcellesCollection)].slice(-50));
    setParcellesCollectionState(normalizeParcellesCollection(next));
    setLastUpdatedAt(Date.now());
    setIsDirty(true);
  }, [historyFuture, parcellesCollection]);

  const canUndo = historyPast.length > 0;
  const canRedo = historyFuture.length > 0;

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
      undo,
      redo,
      canUndo,
      canRedo,
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
      undo,
      redo,
      canUndo,
      canRedo,
      loading,
      error,
      refreshParcelles,
      lastUpdatedAt,
      isDirty
    ]
  );

  return <ParcellesContext.Provider value={value}>{children}</ParcellesContext.Provider>;
}
