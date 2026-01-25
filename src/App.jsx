import { Suspense, lazy, useMemo, useState } from "react";

import ParcellesViewerMap from "./maps/parcelles/ParcellesViewerMap";
import { ParcellesProvider, useParcelles } from "./maps/parcelles/ParcellesStore";
import { buildDeterministicPalette } from "./maps/parcelles/parcellesLayers";

const ParcellesEditorMap = lazy(() => import("./maps/parcelles/ParcellesEditorMap"));

const VIEWER_DEFAULT_FILTERS = {
  cultures: [],
  cultureField: "culture",
  precedent: "",
  ilot: "",
  exploitation: "",
};

function AppContent() {
  const { parcellesCollection } = useParcelles();
  const [mapMode, setMapMode] = useState("editor");
  const [viewerFilters, setViewerFilters] = useState(VIEWER_DEFAULT_FILTERS);
  const [colorBy, setColorBy] = useState("culture");
  const cultureValue = useMemo(
    () => viewerFilters.cultures.join(", "),
    [viewerFilters.cultures]
  );
  const cultureField = viewerFilters.cultureField === "precedent" ? "precedent" : "culture";
  const availableCultures = useMemo(() => {
    const values = new Set();
    (parcellesCollection?.features ?? []).forEach((feature) => {
      const raw = feature?.properties?.[cultureField];
      if (raw == null) return;
      const value = String(raw).trim();
      if (!value) return;
      values.add(value);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "fr"));
  }, [parcellesCollection, cultureField]);
  const culturePalette = useMemo(
    () => buildDeterministicPalette(availableCultures),
    [availableCultures]
  );
  const selectedCultures = useMemo(
    () => new Set(viewerFilters.cultures),
    [viewerFilters.cultures]
  );
  const mapPalette = useMemo(
    () => (colorBy === cultureField ? culturePalette : {}),
    [colorBy, cultureField, culturePalette]
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
              zIndex: 25,
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 12,
              width: 240,
              boxShadow: "0 8px 18px rgba(15, 23, 42, 0.12)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 600 }}>Filtres parcelles</div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#475569" }}>Cultures</span>
              <select
                value={cultureField}
                onChange={(event) => {
                  const nextField = event.target.value === "precedent" ? "precedent" : "culture";
                  setViewerFilters((prev) => ({
                    ...prev,
                    cultureField: nextField,
                    cultures: [],
                  }));
                }}
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  padding: "6px 8px",
                  fontSize: 12,
                }}
              >
                <option value="culture">Année en cours</option>
                <option value="precedent">Année précédente</option>
              </select>
              <input
                type="text"
                placeholder="Blé, Maïs"
                value={cultureValue}
                onChange={(event) => {
                  const raw = event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean);
                  setViewerFilters((prev) => ({ ...prev, cultures: raw }));
                }}
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  padding: "6px 8px",
                  fontSize: 12,
                }}
              />
              <div
                style={{
                  maxHeight: 140,
                  overflowY: "auto",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: "6px 8px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  background: "#f8fafc",
                }}
              >
                {availableCultures.length ? (
                  availableCultures.map((culture) => (
                    <label
                      key={culture}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        color: "#1f2937",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCultures.has(culture)}
                        onChange={(event) => {
                          setViewerFilters((prev) => {
                            const next = new Set(prev.cultures);
                            if (event.target.checked) {
                              next.add(culture);
                            } else {
                              next.delete(culture);
                            }
                            return { ...prev, cultures: Array.from(next) };
                          });
                        }}
                      />
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: culturePalette[culture] || "#94a3b8",
                          border: "1px solid rgba(15, 23, 42, 0.2)",
                        }}
                      />
                      <span>{culture}</span>
                    </label>
                  ))
                ) : (
                  <span style={{ fontSize: 11, color: "#64748b" }}>
                    Aucune culture disponible.
                  </span>
                )}
              </div>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#475569" }}>Précédent</span>
              <input
                type="text"
                value={viewerFilters.precedent}
                onChange={(event) =>
                  setViewerFilters((prev) => ({
                    ...prev,
                    precedent: event.target.value,
                  }))
                }
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  padding: "6px 8px",
                  fontSize: 12,
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#475569" }}>Ilot</span>
              <input
                type="text"
                value={viewerFilters.ilot}
                onChange={(event) =>
                  setViewerFilters((prev) => ({
                    ...prev,
                    ilot: event.target.value,
                  }))
                }
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  padding: "6px 8px",
                  fontSize: 12,
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#475569" }}>Exploitation</span>
              <input
                type="text"
                value={viewerFilters.exploitation}
                onChange={(event) =>
                  setViewerFilters((prev) => ({
                    ...prev,
                    exploitation: event.target.value,
                  }))
                }
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  padding: "6px 8px",
                  fontSize: 12,
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#475569" }}>Couleurs</span>
              <select
                value={colorBy}
                onChange={(event) => setColorBy(event.target.value)}
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  padding: "6px 8px",
                  fontSize: 12,
                }}
              >
                <option value="culture">Culture</option>
                <option value="precedent">Précédent</option>
                <option value="ilot">Ilot</option>
                <option value="exploitation">Exploitation</option>
                <option value="score">Score</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setViewerFilters(VIEWER_DEFAULT_FILTERS)}
              style={{
                marginTop: 4,
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                padding: "6px 8px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Réinitialiser les filtres
            </button>
          </div>
          <ParcellesViewerMap
            filters={viewerFilters}
            colorBy={colorBy}
            palette={mapPalette}
            data={parcellesCollection}
            isActive={mapMode === "viewer"}
          />
        </>
      ) : (
        <Suspense fallback={<div style={{ padding: 24 }}>Chargement de l'éditeur…</div>}>
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
