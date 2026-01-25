import { createContext, useContext, useMemo, useState } from "react";

import { assignUniqueParcelNumbers, normalizeParcellesCollection } from "./parcellesData";

const ParcellesMatchContext = createContext(null);

const buildParcellesByYear = (features) => {
  const grouped = {};
  (features || []).forEach((feature) => {
    const year = Number(feature?.properties?.annee);
    if (!Number.isFinite(year)) return;
    if (!grouped[year]) {
      grouped[year] = { type: "FeatureCollection", features: [] };
    }
    grouped[year].features.push(feature);
  });
  Object.entries(grouped).forEach(([year, collection]) => {
    grouped[year] = assignUniqueParcelNumbers(normalizeParcellesCollection(collection));
  });
  return grouped;
};

export function ParcellesMatchProvider({ features, children }) {
  const parcellesByYear = useMemo(() => buildParcellesByYear(features), [features]);
  const [correspondances, setCorrespondances] = useState({});
  const [selectedIncomingKey, setSelectedIncomingKey] = useState(null);
  const [selectedBaseKey, setSelectedBaseKey] = useState(null);

  const value = useMemo(
    () => ({
      parcellesByYear,
      correspondances,
      setCorrespondances,
      selectedIncomingKey,
      setSelectedIncomingKey,
      selectedBaseKey,
      setSelectedBaseKey,
    }),
    [
      parcellesByYear,
      correspondances,
      selectedIncomingKey,
      selectedBaseKey,
    ]
  );

  return (
    <ParcellesMatchContext.Provider value={value}>
      {children}
    </ParcellesMatchContext.Provider>
  );
}

export function useParcellesMatchStore() {
  const context = useContext(ParcellesMatchContext);
  if (!context) {
    throw new Error("useParcellesMatchStore must be used within ParcellesMatchProvider");
  }
  return context;
}
