import { useMemo, useState } from "react";

import { assignUniqueParcelNumbers, normalizeParcellesCollection } from "./parcellesData";

import { ParcellesMatchContext } from "./ParcellesMatchContext";

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
