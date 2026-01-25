import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { fetchParcellesGeojson } from "../../services/parcellesBackend";
import { normalizeParcellesCollection } from "./parcellesData";

const ParcellesContext = createContext(null);
const EMPTY_COLLECTION = { type: "FeatureCollection", features: [] };

export function ParcellesProvider({ children, initialCollection }) {
  const [parcellesCollection, setParcellesCollectionState] = useState(() =>
    normalizeParcellesCollection(initialCollection || EMPTY_COLLECTION)
  );
  const [loading, setLoading] = useState(!initialCollection);
  const [error, setError] = useState(null);

  const setParcellesCollection = useCallback((next) => {
    setParcellesCollectionState(normalizeParcellesCollection(next));
  }, []);

  const refreshParcelles = useCallback(async (signal) => {
    setLoading(true);
    try {
      const collection = await fetchParcellesGeojson(signal);
      setParcellesCollectionState(normalizeParcellesCollection(collection));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialCollection) return undefined;
    const controller = new AbortController();
    refreshParcelles(controller.signal);
    return () => controller.abort();
  }, [initialCollection, refreshParcelles]);

  const value = useMemo(
    () => ({
      parcellesCollection,
      setParcellesCollection,
      loading,
      error,
      refreshParcelles,
    }),
    [parcellesCollection, setParcellesCollection, loading, error, refreshParcelles]
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
