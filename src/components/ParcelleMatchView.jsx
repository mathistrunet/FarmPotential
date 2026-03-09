import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import {
  buildMatchSuggestions,
  computeFeatureSimilarity,
  getFeatureKey,
  getFeatureLabel,
} from "../utils/parcelleMatching";
import { resolvePreviousDisplayValue } from "../domain/parcelles/fusion";
import { toWgs84 } from "../utils/proj";
import { useRasterLayers } from "../features/map/useRasterLayers";
import {
  addParcellesSourceAndLayers,
  fitToGeojson,
  setColorBy,
  updateGeojsonSource,
} from "../maps/parcelles/parcellesMapLayers";
import { applyFilters } from "../maps/parcelles/parcellesFilters";
import { assignUniqueParcelNumbers, normalizeParcellesCollection } from "../maps/parcelles/parcellesData";
import { ParcellesMatchProvider } from "../maps/parcelles/ParcellesMatchStore";
import { useParcellesMatchStore } from "../maps/parcelles/useParcellesMatchStore";
import {
  cacheYearFeatures,
  getCachedYearEntry,
} from "../services/parcelleMatchCache";

const baseStyle = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {},
  layers: [
    {
      id: "bg",
      type: "background",
      paint: { "background-color": "#eef2ff" },
    },
  ],
};

const LEFT_SOURCE_ID = "parcelles-left";
const LEFT_FILL_ID = "parcelles-fill-left";
const LEFT_LINE_ID = "parcelles-line-left";
const LEFT_SELECTED_ID = "selected-left";
const RIGHT_SOURCE_ID = "parcelles-right";
const RIGHT_FILL_ID = "parcelles-fill-right";
const RIGHT_LINE_ID = "parcelles-line-right";
const RIGHT_SELECTED_ID = "selected-right";
const SELECTED_LINE_COLOR = "#f97316";
const DEFAULT_LEFT_COLOR = "#15803d";
const DEFAULT_RIGHT_COLOR = "#2563eb";

function createMap(container) {
  return new maplibregl.Map({
    container,
    style: baseStyle,
    center: [2.2137, 46.2276],
    zoom: 5,
  });
}

function ensureSelectedLayer(map, sourceId, layerId) {
  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      filter: ["==", ["to-string", ["id"]], ""],
      paint: {
        "line-color": SELECTED_LINE_COLOR,
        "line-width": 3,
      },
    });
  }
}

function updateSelectedFilter(map, layerId, selectedId) {
  if (!map || !map.getLayer(layerId)) return;
  if (!selectedId) {
    map.setFilter(layerId, ["==", ["to-string", ["id"]], ""]);
    return;
  }
  map.setFilter(layerId, ["==", ["to-string", ["id"]], String(selectedId)]);
}

function getFeatureById(collection, featureId) {
  if (!collection?.features || featureId == null) return null;
  const target = String(featureId);
  return (
    collection.features.find((feature) => {
      const id = feature?.id ?? feature?.properties?.__id ?? feature?.properties?.id;
      return id != null && String(id) === target;
    }) || null
  );
}

function getFeatureBounds(feature) {
  if (!feature?.geometry?.coordinates) return null;
  const coords = [];
  flattenCoords(feature.geometry.coordinates, coords);
  if (!coords.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  coords.forEach(([lon, lat]) => {
    minX = Math.min(minX, lon);
    minY = Math.min(minY, lat);
    maxX = Math.max(maxX, lon);
    maxY = Math.max(maxY, lat);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

function easeToFeature(map, feature) {
  if (!map || !feature) return;
  const bounds = getFeatureBounds(feature);
  if (!bounds) return;
  const mapBounds = typeof map.getBounds === "function" ? map.getBounds() : null;
  if (mapBounds && typeof mapBounds.contains === "function") {
    const [sw, ne] = bounds;
    if (mapBounds.contains(sw) && mapBounds.contains(ne)) return;
  }
  map.fitBounds(bounds, { padding: 60, duration: 500 });
}

function attachViewerInteractions({
  map,
  sourceId,
  fillLayerId,
  popupRef,
  hoveredIdRef,
  onClickFeature,
}) {
  const handleMove = (event) => {
    const feature = event.features && event.features[0];
    if (!feature) return;
    const id = feature.id ?? feature.properties?.id;
    if (id == null) return;
    if (hoveredIdRef.current && hoveredIdRef.current !== id) {
      map.setFeatureState({ source: sourceId, id: hoveredIdRef.current }, { hover: false });
    }
    hoveredIdRef.current = id;
    map.setFeatureState({ source: sourceId, id }, { hover: true });
  };

  const handleLeave = () => {
    if (hoveredIdRef.current) {
      map.setFeatureState({ source: sourceId, id: hoveredIdRef.current }, { hover: false });
    }
    hoveredIdRef.current = null;
  };

  const handleClick = (event) => {
    const feature = event.features && event.features[0];
    if (!feature) return;
    if (typeof onClickFeature === "function") {
      onClickFeature(feature, event);
    }
    const props = feature.properties || {};
    const parcelleNo = props.parcelleNo ?? props.numero ?? props.id;
    const title = parcelleNo ? `Parcelle N° ${parcelleNo}` : "Parcelle";
    const culture = props.culture ? `Culture : ${props.culture}` : null;
    const precedentValue = resolvePreviousDisplayValue(props);
    const precedent = precedentValue ? `Précédent : ${precedentValue}` : null;
    const content = [title, culture, precedent].filter(Boolean).join("<br />");
    if (!content) return;
    if (popupRef.current) {
      popupRef.current.remove();
    }
    popupRef.current = new maplibregl.Popup({ closeButton: true })
      .setLngLat(event.lngLat)
      .setHTML(`<div style="font-size:12px;">${content}</div>`)
      .addTo(map);
  };

  map.on("mousemove", fillLayerId, handleMove);
  map.on("mouseleave", fillLayerId, handleLeave);
  map.on("click", fillLayerId, handleClick);

  return () => {
    map.off("mousemove", fillLayerId, handleMove);
    map.off("mouseleave", fillLayerId, handleLeave);
    map.off("click", fillLayerId, handleClick);
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  };
}

function flattenCoords(coords, acc) {
  if (!Array.isArray(coords)) return;
  coords.forEach((coord) => {
    if (Array.isArray(coord) && typeof coord[0] === "number") {
      acc.push(coord);
    } else {
      flattenCoords(coord, acc);
    }
  });
}

function looksProjected(coord) {
  const [x, y] = coord;
  return Math.abs(x) > 180 || Math.abs(y) > 90;
}

function countProjectedCoords(feature) {
  const coords = [];
  if (!feature?.geometry?.coordinates) return 0;
  flattenCoords(feature.geometry.coordinates, coords);
  return coords.reduce((count, coord) => (looksProjected(coord) ? count + 1 : count), 0);
}

function transformCoordsToWgs84(coords) {
  if (!Array.isArray(coords)) return coords;
  return coords.map((coord) => {
    if (Array.isArray(coord) && typeof coord[0] === "number") {
      return looksProjected(coord) ? toWgs84(coord) : coord;
    }
    return transformCoordsToWgs84(coord);
  });
}

function ensureWgs84ForDisplay(feature) {
  if (!feature?.geometry?.coordinates) return feature;
  const projectedCount = countProjectedCoords(feature);
  if (projectedCount === 0) return feature;
  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: transformCoordsToWgs84(feature.geometry.coordinates),
    },
    properties: { ...(feature.properties || {}), _displayReprojected: true },
  };
}

function applyMapUpdates(map, collection, { sourceId, fillLayerId, lineLayerId, selectedLayerId, color }) {
  addParcellesSourceAndLayers(map, sourceId, fillLayerId, lineLayerId, collection);
  ensureSelectedLayer(map, sourceId, selectedLayerId);
  updateGeojsonSource(map, sourceId, collection);
  setColorBy(map, fillLayerId, "fixed", { fixedColor: color });
  applyFilters(map, null, [fillLayerId, lineLayerId]);
  fitToGeojson(map, collection);
  requestAnimationFrame(() => map.resize());
}

function ParcelleMatchViewContent({
  open,
  yearOptions,
  initialYears,
  onClose,
  onValidate,
}) {
  const leftContainerRef = useRef(null);
  const rightContainerRef = useRef(null);
  const leftMapRef = useRef(null);
  const rightMapRef = useRef(null);
  const leftPopupRef = useRef(null);
  const rightPopupRef = useRef(null);
  const leftHoveredIdRef = useRef(null);
  const rightHoveredIdRef = useRef(null);
  const leftCollectionRef = useRef({ type: "FeatureCollection", features: [] });
  const rightCollectionRef = useRef({ type: "FeatureCollection", features: [] });
  const [leftYear, setLeftYear] = useState(initialYears?.left ?? null);
  const [rightYear, setRightYear] = useState(initialYears?.right ?? null);
  const [leftColor, setLeftColor] = useState(DEFAULT_LEFT_COLOR);
  const [rightColor, setRightColor] = useState(DEFAULT_RIGHT_COLOR);
  const [matchRows, setMatchRows] = useState([]);
  const [validatedAt, setValidatedAt] = useState(null);
  const ensureRaster = useRasterLayers();
  const rowRefs = useRef(new Map());
  const matchRowsRef = useRef(matchRows);
  const handleMatchChangeRef = useRef(null);
  const {
    parcellesByYear,
    setCorrespondances,
    selectedIncomingKey,
    setSelectedIncomingKey,
    selectedBaseKey,
    setSelectedBaseKey,
  } = useParcellesMatchStore();
  const selectedIncomingKeyRef = useRef(selectedIncomingKey);
  const leftColorRef = useRef(leftColor);
  const rightColorRef = useRef(rightColor);
  const handleLeftFeatureClickRef = useRef((feature) => feature);
  const handleRightFeatureClickRef = useRef((feature) => feature);

  useEffect(() => {
    if (!open) return;
    const nextLeft = initialYears?.left ?? yearOptions?.[0] ?? null;
    const nextRight = initialYears?.right ?? yearOptions?.[1] ?? null;
    setLeftYear(nextLeft);
    setRightYear(nextRight);
    const leftCache = getCachedYearEntry(nextLeft);
    const rightCache = getCachedYearEntry(nextRight);
    setLeftColor(leftCache?.color ?? DEFAULT_LEFT_COLOR);
    setRightColor(rightCache?.color ?? DEFAULT_RIGHT_COLOR);
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
    leftMap.on("error", (event) => {
      console.error("[MATCH_MAP_LEFT_ERROR] Erreur carte gauche.", event.error || event);
    });
    rightMap.on("error", (event) => {
      console.error("[MATCH_MAP_RIGHT_ERROR] Erreur carte droite.", event.error || event);
    });

    const handleLeftLoad = () => {
      ensureRaster(leftMap);
      addParcellesSourceAndLayers(
        leftMap,
        LEFT_SOURCE_ID,
        LEFT_FILL_ID,
        LEFT_LINE_ID,
        leftCollectionRef.current
      );
      ensureSelectedLayer(leftMap, LEFT_SOURCE_ID, LEFT_SELECTED_ID);
      setColorBy(leftMap, LEFT_FILL_ID, "fixed", { fixedColor: leftColorRef.current });
      applyFilters(leftMap, null, [LEFT_FILL_ID, LEFT_LINE_ID]);
      fitToGeojson(leftMap, leftCollectionRef.current);
      requestAnimationFrame(() => leftMap.resize());
    };
    const handleRightLoad = () => {
      ensureRaster(rightMap);
      addParcellesSourceAndLayers(
        rightMap,
        RIGHT_SOURCE_ID,
        RIGHT_FILL_ID,
        RIGHT_LINE_ID,
        rightCollectionRef.current
      );
      ensureSelectedLayer(rightMap, RIGHT_SOURCE_ID, RIGHT_SELECTED_ID);
      setColorBy(rightMap, RIGHT_FILL_ID, "fixed", { fixedColor: rightColorRef.current });
      applyFilters(rightMap, null, [RIGHT_FILL_ID, RIGHT_LINE_ID]);
      fitToGeojson(rightMap, rightCollectionRef.current);
      requestAnimationFrame(() => rightMap.resize());
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

    const detachLeft = attachViewerInteractions(
      {
        map: leftMap,
        sourceId: LEFT_SOURCE_ID,
        fillLayerId: LEFT_FILL_ID,
        popupRef: leftPopupRef,
        hoveredIdRef: leftHoveredIdRef,
        onClickFeature: (feature) => handleLeftFeatureClickRef.current(feature),
      }
    );
    const detachRight = attachViewerInteractions(
      {
        map: rightMap,
        sourceId: RIGHT_SOURCE_ID,
        fillLayerId: RIGHT_FILL_ID,
        popupRef: rightPopupRef,
        hoveredIdRef: rightHoveredIdRef,
        onClickFeature: (feature) => handleRightFeatureClickRef.current(feature),
      }
    );

    return () => {
      leftMap.off("load", handleLeftLoad);
      rightMap.off("load", handleRightLoad);
      detachLeft();
      detachRight();
      leftMap.remove();
      rightMap.remove();
      leftMapRef.current = null;
      rightMapRef.current = null;
    };
  }, [open, ensureRaster]);

  const leftEntries = useMemo(() => {
    if (!leftYear) return [];
    const collection = parcellesByYear?.[leftYear];
    if (!collection?.features?.length) return [];
    return collection.features.map((feature, index) => ({
      feature,
      key: getFeatureKey(feature, index),
      label: getFeatureLabel(feature, index),
    }));
  }, [parcellesByYear, leftYear]);

  const rightEntries = useMemo(() => {
    if (!rightYear) return [];
    const collection = parcellesByYear?.[rightYear];
    if (!collection?.features?.length) return [];
    return collection.features.map((feature, index) => ({
      feature,
      key: getFeatureKey(feature, index),
      label: getFeatureLabel(feature, index),
    }));
  }, [parcellesByYear, rightYear]);

  const leftDisplayFeatures = useMemo(() => {
    if (!leftYear) return [];
    const collection = parcellesByYear?.[leftYear];
    const sourceCollection =
      collection?.features?.length
        ? collection
        : normalizeParcellesCollection(leftEntries.map((entry) => entry.feature));
    const numberedCollection = assignUniqueParcelNumbers(sourceCollection);
    return numberedCollection.features.map((feature) => ensureWgs84ForDisplay(feature));
  }, [leftEntries, leftYear, parcellesByYear]);

  const rightDisplayFeatures = useMemo(() => {
    if (!rightYear) return [];
    const collection = parcellesByYear?.[rightYear];
    const sourceCollection =
      collection?.features?.length
        ? collection
        : normalizeParcellesCollection(rightEntries.map((entry) => entry.feature));
    const numberedCollection = assignUniqueParcelNumbers(sourceCollection);
    return numberedCollection.features.map((feature) => ensureWgs84ForDisplay(feature));
  }, [rightEntries, rightYear, parcellesByYear]);

  const leftCollection = useMemo(
    () => ({
      type: "FeatureCollection",
      features: leftDisplayFeatures,
    }),
    [leftDisplayFeatures]
  );
  const rightCollection = useMemo(
    () => ({
      type: "FeatureCollection",
      features: rightDisplayFeatures,
    }),
    [rightDisplayFeatures]
  );

  useEffect(() => {
    leftCollectionRef.current = leftCollection;
  }, [leftCollection]);

  useEffect(() => {
    rightCollectionRef.current = rightCollection;
  }, [rightCollection]);

  useEffect(() => {
    if (!leftYear) return;
    cacheYearFeatures(leftYear, leftDisplayFeatures, leftColor);
  }, [leftYear, leftDisplayFeatures, leftColor]);

  useEffect(() => {
    if (!rightYear) return;
    cacheYearFeatures(rightYear, rightDisplayFeatures, rightColor);
  }, [rightYear, rightDisplayFeatures, rightColor]);

  const displayDiagnostics = useMemo(() => {
    const reprojected =
      leftDisplayFeatures.filter((feature) => feature?.properties?._displayReprojected)
        .length +
      rightDisplayFeatures.filter((feature) => feature?.properties?._displayReprojected)
        .length;
    return { reprojected };
  }, [leftDisplayFeatures, rightDisplayFeatures]);

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
      const incomingFeature = incomingEntry?.feature;
      const baseFeature = baseEntry?.feature;
      const incomingNo =
        incomingFeature?.properties?.parcelleNo ??
        incomingFeature?.properties?.numero ??
        incomingFeature?.properties?.id ??
        "";
      const baseNo =
        baseFeature?.properties?.parcelleNo ??
        baseFeature?.properties?.numero ??
        baseFeature?.properties?.id ??
        "";
      return {
        incomingKey: incomingEntry?.key ?? `incoming-${index}`,
        incomingLabel: incomingEntry?.label ?? `Parcelle ${index + 1}`,
        incomingNo,
        baseKey: baseEntry?.key ?? "",
        baseLabel: baseEntry?.label ?? "",
        baseNo,
        similarity: suggestion.similarity ?? 0,
        status: suggestion.isMatch ? "auto" : "unmatched",
      };
    });
    setMatchRows(rows);
    setValidatedAt(null);
  }, [suggestions, leftEntries, rightEntries]);

  useEffect(() => {
    const leftMap = leftMapRef.current;
    const rightMap = rightMapRef.current;
    if (!leftMap || !rightMap) return;
    const applyLeft = () =>
      applyMapUpdates(leftMap, leftCollectionRef.current, {
        sourceId: LEFT_SOURCE_ID,
        fillLayerId: LEFT_FILL_ID,
        lineLayerId: LEFT_LINE_ID,
        selectedLayerId: LEFT_SELECTED_ID,
        color: leftColor,
      });
    const applyRight = () =>
      applyMapUpdates(rightMap, rightCollectionRef.current, {
        sourceId: RIGHT_SOURCE_ID,
        fillLayerId: RIGHT_FILL_ID,
        lineLayerId: RIGHT_LINE_ID,
        selectedLayerId: RIGHT_SELECTED_ID,
        color: rightColor,
      });
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
  }, [leftDisplayFeatures, rightDisplayFeatures, leftColor, rightColor]);

  useEffect(() => {
    if (!leftYear) return;
    const cache = getCachedYearEntry(leftYear);
    setLeftColor(cache?.color ?? DEFAULT_LEFT_COLOR);
  }, [leftYear]);

  useEffect(() => {
    if (!rightYear) return;
    const cache = getCachedYearEntry(rightYear);
    setRightColor(cache?.color ?? DEFAULT_RIGHT_COLOR);
  }, [rightYear]);

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

  const handleMatchChange = useCallback((incomingKey, nextBaseKey) => {
    setSelectedIncomingKey(incomingKey);
    setSelectedBaseKey(nextBaseKey || null);
    setMatchRows((prev) =>
      prev.map((row) => {
        if (row.incomingKey !== incomingKey) return row;
        if (!nextBaseKey) {
          return {
            ...row,
            baseKey: "",
            baseLabel: "",
            baseNo: "",
            similarity: 0,
            status: "manual",
          };
        }
        const baseFeature = baseByKey.get(nextBaseKey);
        const incomingFeature = incomingByKey.get(incomingKey);
        const similarity = computeFeatureSimilarity(baseFeature, incomingFeature);
        const baseLabel =
          leftEntries.find((entry) => entry.key === nextBaseKey)?.label ?? "";
        const baseNo =
          baseFeature?.properties?.parcelleNo ??
          baseFeature?.properties?.numero ??
          baseFeature?.properties?.id ??
          "";
        return {
          ...row,
          baseKey: nextBaseKey,
          baseLabel,
          baseNo,
          similarity,
          status: "manual",
        };
      })
    );
  }, [baseByKey, incomingByKey, leftEntries, setSelectedBaseKey, setSelectedIncomingKey]);

  const handleRowSelect = useCallback((incomingKey) => {
    setSelectedIncomingKey(incomingKey);
    const row = matchRowsRef.current.find((entry) => entry.incomingKey === incomingKey);
    setSelectedBaseKey(row?.baseKey || null);
  }, [setSelectedBaseKey, setSelectedIncomingKey]);

  const handleValidate = async () => {
    if (typeof onValidate !== "function") {
      setValidatedAt(new Date());
      return;
    }
    try {
      const result = await onValidate({
        rows: matchRows,
        leftYear,
        rightYear,
      });
      if (result !== false) {
        setValidatedAt(new Date());
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      console.error(`[MATCH_VALIDATE_FAILED] Validation impossible: ${message}`);
    }
  };

  const handleLeftFeatureClick = useCallback((feature) => {
    const baseKey = String(feature.id ?? feature.properties?.id ?? "");
    if (!baseKey) return;
    setSelectedBaseKey(baseKey);
    const incomingKey = selectedIncomingKeyRef.current;
    if (!incomingKey) return;
    if (handleMatchChangeRef.current) {
      handleMatchChangeRef.current(incomingKey, baseKey);
    }
  }, [setSelectedBaseKey]);

  const handleRightFeatureClick = useCallback((feature) => {
    const incomingKey = String(feature.id ?? feature.properties?.id ?? "");
    if (!incomingKey) return;
    handleRowSelect(incomingKey);
  }, [handleRowSelect]);

  useEffect(() => {
    leftColorRef.current = leftColor;
  }, [leftColor]);

  useEffect(() => {
    rightColorRef.current = rightColor;
  }, [rightColor]);

  useEffect(() => {
    handleLeftFeatureClickRef.current = handleLeftFeatureClick;
    handleRightFeatureClickRef.current = handleRightFeatureClick;
  }, [handleLeftFeatureClick, handleRightFeatureClick]);

  useEffect(() => {
    if (!selectedIncomingKey) return;
    const row = matchRows.find((entry) => entry.incomingKey === selectedIncomingKey);
    if (!row) return;
    setSelectedBaseKey(row.baseKey || null);
  }, [matchRows, selectedIncomingKey, setSelectedBaseKey]);

  useEffect(() => {
    matchRowsRef.current = matchRows;
  }, [matchRows]);

  useEffect(() => {
    selectedIncomingKeyRef.current = selectedIncomingKey;
  }, [selectedIncomingKey]);

  useEffect(() => {
    handleMatchChangeRef.current = handleMatchChange;
  }, [handleMatchChange]);

  useEffect(() => {
    const next = {};
    matchRows.forEach((row) => {
      if (row.baseKey) {
        next[row.incomingKey] = row.baseKey;
      }
    });
    setCorrespondances(next);
  }, [matchRows, setCorrespondances]);
  useEffect(() => {
    if (!selectedIncomingKey) return;
    const node = rowRefs.current.get(selectedIncomingKey);
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIncomingKey]);

  useEffect(() => {
    if (!open) return;
    const leftMap = leftMapRef.current;
    const rightMap = rightMapRef.current;
    if (!leftMap || !rightMap) return;
    requestAnimationFrame(() => {
      leftMap.resize();
      rightMap.resize();
    });
  }, [open]);

  useEffect(() => {
    const leftMap = leftMapRef.current;
    const rightMap = rightMapRef.current;
    updateSelectedFilter(leftMap, LEFT_SELECTED_ID, selectedBaseKey);
    updateSelectedFilter(rightMap, RIGHT_SELECTED_ID, selectedIncomingKey);
  }, [selectedBaseKey, selectedIncomingKey]);

  useEffect(() => {
    const leftMap = leftMapRef.current;
    const rightMap = rightMapRef.current;
    if (selectedBaseKey && leftMap) {
      const feature = getFeatureById(leftCollectionRef.current, selectedBaseKey);
      if (feature) {
        easeToFeature(leftMap, feature);
      }
    }
    if (selectedIncomingKey && rightMap) {
      const feature = getFeatureById(rightCollectionRef.current, selectedIncomingKey);
      if (feature) {
        easeToFeature(rightMap, feature);
      }
    }
  }, [selectedBaseKey, selectedIncomingKey]);

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
            Couleur gauche
            <input
              type="color"
              value={leftColor}
              onChange={(event) => setLeftColor(event.target.value)}
              style={{ marginLeft: 8, width: 36, height: 28, padding: 0 }}
            />
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
          <label style={{ fontSize: 12, color: "#475569" }}>
            Couleur droite
            <input
              type="color"
              value={rightColor}
              onChange={(event) => setRightColor(event.target.value)}
              style={{ marginLeft: 8, width: 36, height: 28, padding: 0 }}
            />
          </label>
        </div>
        {displayDiagnostics.reprojected > 0 && (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "#b45309",
              background: "#fffbeb",
              border: "1px solid #fcd34d",
              padding: "6px 10px",
              borderRadius: 8,
            }}
          >
            {displayDiagnostics.reprojected} parcelle
            {displayDiagnostics.reprojected > 1 ? "s" : ""}{" "}
            {displayDiagnostics.reprojected > 1 ? "ont" : "a"} été reprojetée
            {displayDiagnostics.reprojected > 1 ? "s" : ""} en WGS84 pour
            l’affichage (coordonnées Lambert-93 détectées).
          </div>
        )}
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
                  <th style={{ padding: "6px 8px" }}>N° {rightYear ?? "—"}</th>
                  <th style={{ padding: "6px 8px" }}>
                    Parcelle {rightYear ?? "—"}
                  </th>
                  <th style={{ padding: "6px 8px" }}>N° {leftYear ?? "—"}</th>
                  <th style={{ padding: "6px 8px" }}>
                    Correspondance {leftYear ?? "—"}
                  </th>
                  <th style={{ padding: "6px 8px" }}>Similarité</th>
                  <th style={{ padding: "6px 8px" }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {matchRows.map((row) => (
                  <tr
                    key={row.incomingKey}
                    ref={(node) => {
                      if (node) {
                        rowRefs.current.set(row.incomingKey, node);
                      }
                    }}
                    onClick={() => handleRowSelect(row.incomingKey)}
                    style={{
                      borderTop: "1px solid #e2e8f0",
                      background:
                        selectedIncomingKey === row.incomingKey
                          ? "rgba(59, 130, 246, 0.08)"
                          : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "6px 8px", fontSize: 13 }}>
                      {row.incomingNo || "—"}
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: 13 }}>
                      {row.incomingLabel}
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: 13 }}>
                      {row.baseKey ? row.baseNo || "—" : "—"}
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

export default function ParcelleMatchView(props) {
  if (!props.open) return null;
  return (
    <ParcellesMatchProvider features={props.features}>
      <ParcelleMatchViewContent {...props} />
    </ParcellesMatchProvider>
  );
}
