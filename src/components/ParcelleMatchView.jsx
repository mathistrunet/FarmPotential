import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import {
  buildMatchSuggestions,
  computeFeatureSimilarity,
  getFeatureKey,
  getFeatureLabel,
} from "../utils/parcelleMatching";

const baseStyle = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {},
  layers: [
    {
      id: "bg",
      type: "background",
      paint: { "background-color": "#e5eef7" },
    },
  ],
};

const SOURCE_ID = "parcelles";

function createMap(container) {
  return new maplibregl.Map({
    container,
    style: baseStyle,
    center: [2.2137, 46.2276],
    zoom: 5,
  });
}

function ensureLayer(map, color) {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(`${SOURCE_ID}-fill`)) {
    map.addLayer({
      id: `${SOURCE_ID}-fill`,
      type: "fill",
      source: SOURCE_ID,
      paint: { "fill-color": color, "fill-opacity": 0.35 },
    });
  }
  if (!map.getLayer(`${SOURCE_ID}-line`)) {
    map.addLayer({
      id: `${SOURCE_ID}-line`,
      type: "line",
      source: SOURCE_ID,
      paint: { "line-color": color, "line-width": 2 },
    });
  }
}

function updateMapFeatures(map, features, color) {
  if (!map) return;
  ensureLayer(map, color);
  const source = map.getSource(SOURCE_ID);
  if (source) {
    source.setData({
      type: "FeatureCollection",
      features,
    });
  }
}

function syncMapView(map, features, color) {
  if (!map) return;
  updateMapFeatures(map, features, color);
  fitMapToFeatures(map, features);
  map.resize();
}

function collectCoordinates(coords, acc) {
  coords.forEach((coord) => {
    if (!Array.isArray(coord)) return;
    if (typeof coord[0] === "number" && typeof coord[1] === "number") {
      acc.push(coord);
    } else {
      collectCoordinates(coord, acc);
    }
  });
}

function fitMapToFeatures(map, features) {
  if (!map || !features.length) return;
  const points = [];
  features.forEach((feature) => {
    const geometry = feature?.geometry;
    if (!geometry?.coordinates) return;
    collectCoordinates(geometry.coordinates, points);
  });
  if (!points.length) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach(([lon, lat]) => {
    minX = Math.min(minX, lon);
    minY = Math.min(minY, lat);
    maxX = Math.max(maxX, lon);
    maxY = Math.max(maxY, lat);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
  map.fitBounds(
    [
      [minX, minY],
      [maxX, maxY],
    ],
    { padding: 40, duration: 0 }
  );
}

export default function ParcelleMatchView({
  open,
  features,
  yearOptions,
  initialYears,
  onClose,
  onValidate,
}) {
  const leftContainerRef = useRef(null);
  const rightContainerRef = useRef(null);
  const leftMapRef = useRef(null);
  const rightMapRef = useRef(null);
  const leftFeaturesRef = useRef([]);
  const rightFeaturesRef = useRef([]);
  const [leftYear, setLeftYear] = useState(initialYears?.left ?? null);
  const [rightYear, setRightYear] = useState(initialYears?.right ?? null);
  const [matchRows, setMatchRows] = useState([]);
  const [validatedAt, setValidatedAt] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLeftYear(initialYears?.left ?? yearOptions?.[0] ?? null);
    setRightYear(initialYears?.right ?? yearOptions?.[1] ?? null);
  }, [open, initialYears, yearOptions]);

  useEffect(() => {
    if (!open) return;
    if (!leftContainerRef.current || !rightContainerRef.current) return;
    const leftMap = createMap(leftContainerRef.current);
    const rightMap = createMap(rightContainerRef.current);
    leftMapRef.current = leftMap;
    rightMapRef.current = rightMap;
    leftMap.addControl(new maplibregl.NavigationControl(), "top-left");
    rightMap.addControl(new maplibregl.NavigationControl(), "top-left");

    const handleLeftLoad = () => {
      syncMapView(leftMap, leftFeaturesRef.current, "#15803d");
    };
    const handleRightLoad = () => {
      syncMapView(rightMap, rightFeaturesRef.current, "#2563eb");
    };
    if (leftMap.isStyleLoaded()) {
      handleLeftLoad();
    } else {
      leftMap.once("load", handleLeftLoad);
    }
    if (rightMap.isStyleLoaded()) {
      handleRightLoad();
    } else {
      rightMap.once("load", handleRightLoad);
    }

    return () => {
      leftMap.off("load", handleLeftLoad);
      rightMap.off("load", handleRightLoad);
      leftMap.remove();
      rightMap.remove();
      leftMapRef.current = null;
      rightMapRef.current = null;
    };
  }, [open]);

  const leftEntries = useMemo(() => {
    if (!leftYear) return [];
    return features
      .filter((feature) => Number(feature?.properties?.annee) === Number(leftYear))
      .map((feature, index) => ({
        feature,
        key: getFeatureKey(feature, index),
        label: getFeatureLabel(feature, index),
      }));
  }, [features, leftYear]);

  const rightEntries = useMemo(() => {
    if (!rightYear) return [];
    return features
      .filter((feature) => Number(feature?.properties?.annee) === Number(rightYear))
      .map((feature, index) => ({
        feature,
        key: getFeatureKey(feature, index),
        label: getFeatureLabel(feature, index),
      }));
  }, [features, rightYear]);

  const suggestions = useMemo(
    () =>
      buildMatchSuggestions(
        leftEntries.map((entry) => entry.feature),
        rightEntries.map((entry) => entry.feature)
      ),
    [leftEntries, rightEntries]
  );

  useEffect(() => {
    const rows = suggestions.map((suggestion, index) => {
      const incomingEntry = rightEntries[index];
      const baseEntry =
        suggestion.baseIndex != null ? leftEntries[suggestion.baseIndex] : null;
      return {
        incomingKey: incomingEntry?.key ?? `incoming-${index}`,
        incomingLabel: incomingEntry?.label ?? `Parcelle ${index + 1}`,
        baseKey: baseEntry?.key ?? "",
        baseLabel: baseEntry?.label ?? "",
        similarity: suggestion.similarity ?? 0,
        status: suggestion.isMatch ? "auto" : "unmatched",
      };
    });
    setMatchRows(rows);
    setValidatedAt(null);
  }, [suggestions, leftEntries, rightEntries]);

  useEffect(() => {
    leftFeaturesRef.current = leftEntries.map((entry) => entry.feature);
    rightFeaturesRef.current = rightEntries.map((entry) => entry.feature);
    const leftMap = leftMapRef.current;
    const rightMap = rightMapRef.current;
    if (!leftMap || !rightMap) return;
    const applyLeft = () =>
      syncMapView(leftMap, leftFeaturesRef.current, "#15803d");
    const applyRight = () =>
      syncMapView(rightMap, rightFeaturesRef.current, "#2563eb");
    if (leftMap.isStyleLoaded()) {
      applyLeft();
    } else {
      leftMap.once("load", applyLeft);
    }
    if (rightMap.isStyleLoaded()) {
      applyRight();
    } else {
      rightMap.once("load", applyRight);
    }
  }, [leftEntries, rightEntries]);

  const baseByKey = useMemo(() => {
    const map = new Map();
    leftEntries.forEach((entry) => map.set(entry.key, entry.feature));
    return map;
  }, [leftEntries]);

  const incomingByKey = useMemo(() => {
    const map = new Map();
    rightEntries.forEach((entry) => map.set(entry.key, entry.feature));
    return map;
  }, [rightEntries]);

  const baseOptions = leftEntries.map((entry) => ({
    value: entry.key,
    label: entry.label,
  }));

  const handleMatchChange = (incomingKey, nextBaseKey) => {
    setMatchRows((prev) =>
      prev.map((row) => {
        if (row.incomingKey !== incomingKey) return row;
        if (!nextBaseKey) {
          return {
            ...row,
            baseKey: "",
            baseLabel: "",
            similarity: 0,
            status: "manual",
          };
        }
        const baseFeature = baseByKey.get(nextBaseKey);
        const incomingFeature = incomingByKey.get(incomingKey);
        const similarity = computeFeatureSimilarity(baseFeature, incomingFeature);
        const baseLabel =
          leftEntries.find((entry) => entry.key === nextBaseKey)?.label ?? "";
        return {
          ...row,
          baseKey: nextBaseKey,
          baseLabel,
          similarity,
          status: "manual",
        };
      })
    );
  };

  const handleValidate = () => {
    setValidatedAt(new Date());
    if (typeof onValidate === "function") {
      onValidate(matchRows);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#f8fafc",
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #e2e8f0",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Correspondances de parcelles</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
            L’algorithme propose des correspondances, rien n’est fusionné sans votre
            validation.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #cbd5f5",
            background: "#eef2ff",
            cursor: "pointer",
          }}
        >
          Retour
        </button>
      </div>

      <div style={{ padding: "12px 20px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "#475569" }}>
            Année gauche
            <select
              value={leftYear ?? ""}
              onChange={(event) => setLeftYear(event.target.value)}
              style={{
                marginLeft: 8,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #cbd5f5",
              }}
            >
              {yearOptions.map((year) => (
                <option key={`left-${year}`} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "#475569" }}>
            Année droite
            <select
              value={rightYear ?? ""}
              onChange={(event) => setRightYear(event.target.value)}
              style={{
                marginLeft: 8,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #cbd5f5",
              }}
            >
              {yearOptions.map((year) => (
                <option key={`right-${year}`} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          padding: "0 20px 16px",
          flex: 1,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid #e2e8f0",
              fontWeight: 600,
              color: "#166534",
            }}
          >
            Carte {leftYear ?? "—"}
          </div>
          <div ref={leftContainerRef} style={{ flex: 1, minHeight: 320 }} />
        </div>
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid #e2e8f0",
              fontWeight: 600,
              color: "#1d4ed8",
            }}
          >
            Carte {rightYear ?? "—"}
          </div>
          <div ref={rightContainerRef} style={{ flex: 1, minHeight: 320 }} />
        </div>
      </div>

      <div style={{ padding: "0 20px 20px" }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Tableau des correspondances
          </div>
          <div style={{ maxHeight: 240, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, color: "#64748b" }}>
                  <th style={{ padding: "6px 8px" }}>
                    Parcelle {rightYear ?? "—"}
                  </th>
                  <th style={{ padding: "6px 8px" }}>
                    Correspondance {leftYear ?? "—"}
                  </th>
                  <th style={{ padding: "6px 8px" }}>Similarité</th>
                  <th style={{ padding: "6px 8px" }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {matchRows.map((row) => (
                  <tr key={row.incomingKey} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "6px 8px", fontSize: 13 }}>
                      {row.incomingLabel}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <select
                        value={row.baseKey}
                        onChange={(event) =>
                          handleMatchChange(row.incomingKey, event.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #cbd5f5",
                        }}
                      >
                        <option value="">Aucune correspondance</option>
                        {baseOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: 13 }}>
                      {(row.similarity * 100).toFixed(1)}%
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: 12, color: "#475569" }}>
                      {row.status === "auto" && "Proposition auto"}
                      {row.status === "manual" && "Ajusté"}
                      {row.status === "unmatched" && "Sans proposition"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, color: "#64748b" }}>
              {validatedAt
                ? `Dernière validation : ${validatedAt.toLocaleTimeString("fr-FR")}`
                : "Validez pour enregistrer les correspondances proposées."}
            </div>
            <button
              type="button"
              onClick={handleValidate}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #0f172a",
                background: "#0f172a",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Valider les correspondances
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
