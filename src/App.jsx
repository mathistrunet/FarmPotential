import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import ParcellesViewerMap from "./maps/parcelles/ParcellesViewerMap";
import { ParcellesProvider } from "./maps/parcelles/ParcellesStore";
import { useParcelles } from "./maps/parcelles/useParcelles";
import { buildDeterministicPalette } from "./maps/parcelles/parcellesLayers";
import { projectCultureYear } from "./maps/parcelles/parcellesData";
import { codeFromLabel, labelFromCode } from "./utils/cultureLabels";

const ParcellesEditorMap = lazy(() => import("./maps/parcelles/ParcellesEditorMap"));

const VIEWER_DEFAULT_FILTERS = {
  cultures: [],
  cultureField: "cultureN",
  ilot: "",
};

function AppContent() {
  const { parcellesCollection } = useParcelles();
  const [mapMode, setMapMode] = useState("editor");
  const [viewerFilters, setViewerFilters] = useState(VIEWER_DEFAULT_FILTERS);
  const [colorBy, setColorBy] = useState("culture");
  const cultureYear = viewerFilters.cultureField || "cultureN";
  const viewerCollection = useMemo(
    () => projectCultureYear(parcellesCollection, cultureYear),
    [parcellesCollection, cultureYear]
  );
  const cultureValue = useMemo(
    () =>
      viewerFilters.cultures
        .map((code) => labelFromCode(code) || code)
        .join(", "),
    [viewerFilters.cultures]
  );
  const availableCultures = useMemo(() => {
    const values = new Map();
    (viewerCollection?.features ?? []).forEach((feature) => {
      const raw = feature?.properties?.culture;
      if (raw == null) return;
      const code = String(raw).trim();
      if (!code) return;
      const label = labelFromCode(code) || code;
      if (!values.has(code)) {
        values.set(code, label);
      }
    });
    return Array.from(values.entries())
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [viewerCollection]);
  const culturePalette = useMemo(
    () => buildDeterministicPalette(availableCultures.map((entry) => entry.code)),
    [availableCultures]
  );
  const selectedCultures = useMemo(
    () => new Set(viewerFilters.cultures),
    [viewerFilters.cultures]
  );
  const mapPalette = useMemo(
    () => (colorBy === "culture" ? culturePalette : {}),
    [colorBy, culturePalette]
  );
  const cultureYearOptions = useMemo(() => {
    const entries = new Set();
    const features = parcellesCollection?.features ?? [];
    for (const feature of features) {
      const properties = feature?.properties;
      if (!properties) continue;
      Object.keys(properties).forEach((key) => {
        if (key === "culture") {
          entries.add(key);
          return;
        }
        if (/^cultureN(_?\d+)?$/i.test(key)) {
          entries.add(key);
        }
      });
      if (entries.size > 12) break;
    }
    const buildLabel = (key) => {
      const normalized = key.toLowerCase();
      if (normalized === "culture") return "Culture (champ générique)";
      const match = normalized.match(/^culturen_?(\d+)?$/);
      if (!match) return key;
      const offset = match[1] ? Number(match[1]) : 0;
      if (!Number.isFinite(offset) || offset <= 0) {
        return "Culture N";
      }
      return `Culture N-${offset}`;
    };
    const options = Array.from(entries).map((key) => ({
      value: key,
      label: buildLabel(key),
    }));
    if (viewerFilters.cultureField && !entries.has(viewerFilters.cultureField)) {
      options.push({
        value: viewerFilters.cultureField,
        label: buildLabel(viewerFilters.cultureField),
      });
    }
    options.sort((a, b) => {
      const extract = (value) => {
        const match = value.toLowerCase().match(/^culturen_?(\d+)?$/);
        if (!match) return Number.POSITIVE_INFINITY;
        return match[1] ? Number(match[1]) : 0;
      };
      return extract(a.value) - extract(b.value);
    });
    if (!options.length) {
      return [
        { value: "cultureN", label: "Culture N" },
        { value: "cultureN_1", label: "Culture N-1" },
      ];
    }
    return options;
  }, [parcellesCollection, viewerFilters.cultureField]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const sample = viewerCollection?.features?.find((feature) => feature?.properties);
    if (!sample) return;
    const keys = Object.keys(sample.properties || {});
    console.info("[ViewerFilters] properties keys sample", keys);
    console.info("[ViewerFilters] culture year mapping", {
      cultureYear,
      cultureValue: sample.properties?.culture,
    });
  }, [viewerCollection, cultureYear]);

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
                value={cultureYear}
                onChange={(event) => {
                  const nextField = event.target.value || "cultureN";
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
                {cultureYearOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Blé, Maïs"
                value={cultureValue}
                onChange={(event) => {
                  const raw = event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean)
                    .map((value) => codeFromLabel(value) || value);
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
                      key={culture.code}
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
                        checked={selectedCultures.has(culture.code)}
                        onChange={(event) => {
                          setViewerFilters((prev) => {
                            const next = new Set(prev.cultures);
                            if (event.target.checked) {
                              next.add(culture.code);
                            } else {
                              next.delete(culture.code);
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
                          background: culturePalette[culture.code] || "#94a3b8",
                          border: "1px solid rgba(15, 23, 42, 0.2)",
                        }}
                      />
                      <span>{culture.label}</span>
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
            data={viewerCollection}
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
