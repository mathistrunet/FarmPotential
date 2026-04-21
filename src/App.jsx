import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import ParcellesViewerMap from "./maps/parcelles/ParcellesViewerMap";
import { ParcellesProvider } from "./maps/parcelles/ParcellesStore";
import { useParcelles } from "./maps/parcelles/useParcelles";
import { normalizeParcellesCollection } from "./maps/parcelles/parcellesData";
import { buildDeterministicPalette } from "./maps/parcelles/parcellesLayers";

const ParcellesEditorMap = lazy(() => import("./maps/parcelles/ParcellesEditorMap"));
const UNKNOWN_YEAR = "unknown";

function normalizeYearValue(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function AppContent() {
  const { parcellesCollection } = useParcelles();
  const [mapMode, setMapMode] = useState("editor");
  const [viewerYearFilter, setViewerYearFilter] = useState("all");
  const [viewerCultures, setViewerCultures] = useState([]);

  const normalizedViewerCollection = useMemo(
    () => normalizeParcellesCollection(parcellesCollection),
    [parcellesCollection]
  );

  const yearOptions = useMemo(() => {
    const years = new Set();
    let hasUnknown = false;
    (normalizedViewerCollection?.features || []).forEach((feature) => {
      const year = normalizeYearValue(feature?.properties?.annee);
      if (year == null) {
        hasUnknown = true;
        return;
      }
      years.add(year);
    });
    return { years: Array.from(years).sort((a, b) => b - a), hasUnknown };
  }, [normalizedViewerCollection]);

  useEffect(() => {
    if (viewerYearFilter === "all") return;
    if (viewerYearFilter === UNKNOWN_YEAR && yearOptions.hasUnknown) return;
    const parsed = normalizeYearValue(viewerYearFilter);
    if (parsed != null && yearOptions.years.includes(parsed)) return;
    setViewerYearFilter("all");
  }, [viewerYearFilter, yearOptions]);

  const cultureOptions = useMemo(() => {
    const selectedYear = viewerYearFilter;
    const values = new Set();
    (normalizedViewerCollection?.features || []).forEach((feature) => {
      const props = feature?.properties || {};
      const year = normalizeYearValue(props.annee);
      if (selectedYear === UNKNOWN_YEAR) {
        if (year != null) return;
      } else if (selectedYear !== "all") {
        const targetYear = normalizeYearValue(selectedYear);
        if (targetYear != null && year !== targetYear) return;
      }

      const culture = String(props.culture || "").trim();
      if (culture) values.add(culture);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "fr"));
  }, [normalizedViewerCollection, viewerYearFilter]);

  useEffect(() => {
    setViewerCultures((prev) => prev.filter((culture) => cultureOptions.includes(culture)));
  }, [cultureOptions]);

  const legendPalette = useMemo(
    () => buildDeterministicPalette(cultureOptions),
    [cultureOptions]
  );

  const toggleCulture = (culture) => {
    setViewerCultures((prev) => {
      if (prev.includes(culture)) return prev.filter((item) => item !== culture);
      return [...prev, culture];
    });
  };

  const viewerFilters = useMemo(
    () => ({ year: viewerYearFilter, cultures: viewerCultures }),
    [viewerYearFilter, viewerCultures]
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 30,
          display: "flex",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={() => setMapMode("viewer")}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: mapMode === "viewer" ? "#111" : "#fff",
            color: mapMode === "viewer" ? "#fff" : "#111",
            cursor: "pointer",
          }}
        >
          Viewer
        </button>
        <button
          type="button"
          onClick={() => setMapMode("editor")}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: mapMode === "editor" ? "#111" : "#fff",
            color: mapMode === "editor" ? "#fff" : "#111",
            cursor: "pointer",
          }}
        >
          Editor
        </button>
      </div>

      {mapMode === "viewer" ? (
        <>
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              zIndex: 30,
              width: 320,
              maxHeight: "calc(100vh - 24px)",
              overflow: "auto",
              background: "rgba(255,255,255,0.96)",
              border: "1px solid #d1d5db",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
              padding: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
              Filtres Viewer
            </div>

            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#374151" }}>
              Annee
              <select
                value={viewerYearFilter}
                onChange={(e) => setViewerYearFilter(e.target.value)}
                style={{
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                }}
              >
                <option value="all">Toutes</option>
                {yearOptions.years.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
                {yearOptions.hasUnknown ? <option value={UNKNOWN_YEAR}>Annee inconnue</option> : null}
              </select>
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>Cultures</div>
              <button
                type="button"
                onClick={() => setViewerCultures(cultureOptions)}
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  padding: "3px 6px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Tout
              </button>
              <button
                type="button"
                onClick={() => setViewerCultures([])}
                style={{
                  fontSize: 11,
                  padding: "3px 6px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Aucun
              </button>
            </div>

            <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto", paddingRight: 2 }}>
              {cultureOptions.length === 0 ? (
                <div style={{ fontSize: 12, color: "#6b7280" }}>Aucune culture pour ce filtre d'annee.</div>
              ) : (
                cultureOptions.map((culture) => {
                  const isChecked = viewerCultures.includes(culture);
                  return (
                    <label
                      key={culture}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12,
                        color: "#1f2937",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCulture(culture)}
                      />
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: legendPalette[culture] || "#60a5fa",
                          border: "1px solid rgba(15,23,42,0.18)",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ lineHeight: 1.3 }}>{culture}</span>
                    </label>
                  );
                })
              )}
            </div>

            <div style={{ fontSize: 11, color: "#6b7280" }}>
              Les parcelles affichees sont filtrees par annee et cultures selectionnees.
            </div>
          </div>

          <ParcellesViewerMap
            data={parcellesCollection}
            isActive
            filters={viewerFilters}
            colorBy="culture"
            palette={legendPalette}
          />
        </>
      ) : (
        <Suspense fallback={<div style={{ padding: 24 }}>Chargement de l'editor...</div>}>
          <ParcellesEditorMap />
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ParcellesProvider>
      <AppContent />
    </ParcellesProvider>
  );
}
