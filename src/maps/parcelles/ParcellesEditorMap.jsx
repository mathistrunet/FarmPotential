// src/maps/parcelles/ParcellesEditorMap.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import centroid from "@turf/centroid";

import RasterToggles from "../../components/RasterToggles";
import ParcelleEditor from "../../components/ParcelleEditor";
import { useMapInitialization } from "../../features/map/useMapInitialization";
import { DEFAULT_FILL_OPACITY } from "../../config/soilsLocalConfig";
import { GEO_PORTAIL_SOIL_DEFAULT_OPACITY } from "../../config/soilGeoportal";
import { RASTER_LAYERS, DEFAULT_FEATURE_INFO_PARSER } from "../../config/rasterLayers";

import MapInfoPanel from "../../components/MapInfoPanel";

// ✅ composant RPG autonome (chemin conservé)
import RpgFeature from "../../Front/useRpgLayer";
// ✅ composant Dessin autonome (chemin conservé)
import DrawToolbar from "../../Front/DrawToolbar";
// ✅ Import/Export Télépac (chemin conservé)
import ImportTelepacButton from "../../Front/TelepacButton";
import ExportMenuButton from "../../Front/ExportMenuButton";
import ParcelleMatchView from "../../components/ParcelleMatchView";
import SoilTypeMappingPanel from "../../components/SoilTypeMappingPanel";

// ✅ NOUVEAU : hook d’affichage RRP local (depuis un fichier MBTiles placé dans /public/data)
import { useSoilLayerLocal } from "../../features/useSoilLayerLocal";
import { useToponymieAutoNaming } from "../../features/useToponymieAutoNaming";
import { withBasePath } from "../../utils/publicBase";
import { ERROR_CODES } from "../../utils/errors";
import {
  applyCorrespondencesAndMerge,
  buildParcellesByYearFromFeatures,
  getFeatureId,
} from "../../domain/parcelles/fusion";
import { getFeatureKey } from "../../utils/parcelleMatching";
import {
  clearParcellesGeojson,
  saveParcellesGeojson,
  validateParcellesMatching,
} from "../../services/parcellesBackend";
import { useParcelles } from "./useParcelles";
import {
  loadSoilTypeLookupBySourceFile,
  loadSoilTypeLookupByUcsId,
  resolveFileUcs,
  resolveUcsId,
  buildSoilCombinationKey,
} from "../../services/soilTypeMapping";
import { featureAreaM2 } from "../../utils/geometry";
import { fetchSoilGridsVisibleGrid } from "../../services/soilgridsGridBackend";

const EARTH_RADIUS = 6378137;
const DRAW_LAYER_IDS = [
  "draw-polygon-fill-overlap-warning",
  "draw-polygon-stroke-overlap-warning",
  "draw-polygon-fill-inactive",
  "draw-polygon-fill-import-mismatch",
  "draw-polygon-fill-active",
  "draw-polygon-stroke-inactive",
  "draw-polygon-stroke-import-mismatch",
  "draw-polygon-stroke-active",
  "draw-vertex-halo-active",
  "draw-vertex-active",
  "draw-vertex-midpoint",
  "draw-vertex-inactive",
  "draw-polygon-fill-static",
  "draw-polygon-stroke-static",
  "draw-line-static",
  "draw-line-inactive",
  "draw-line-active",
];
const INVALID_YEAR = -9999;
const DEFAULT_PARCELLE_YEAR = new Date().getFullYear();

const normalizeYearValue = (value) => {
  if (value == null) return null;
  const trimmed = typeof value === "string" ? value.trim() : value;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const ensureFeaturesHaveYear = (inputFeatures) => {
  const featuresList = Array.isArray(inputFeatures) ? inputFeatures : [];
  const knownYears = featuresList
    .map((feature) => normalizeYearValue(feature?.properties?.annee))
    .filter((value) => value != null);

  const fallbackYear = knownYears.length > 0 ? Math.max(...knownYears) : DEFAULT_PARCELLE_YEAR;

  let changed = false;
  const nextFeatures = featuresList.map((feature) => {
    if (!feature || feature.type !== "Feature") return feature;
    const currentYear = normalizeYearValue(feature?.properties?.annee);
    if (currentYear != null) return feature;

    changed = true;
    return {
      ...feature,
      properties: {
        ...(feature.properties || {}),
        annee: fallbackYear,
      },
    };
  });

  return { changed, nextFeatures };
};
const DRAW_LAYER_VARIANTS = ["", ".cold", ".hot"];
const SOILGRIDS_GRID_SOURCE_ID = "soilgrids-grid-source";
const SOILGRIDS_GRID_LAYER_ID = "soilgrids-grid-layer";
const EMPTY_COLLECTION = { type: "FeatureCollection", features: [] };

function buildSoilProbePoints(feature) {
  const probes = [];
  const register = (coordinates) => {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return;
    const [lng, lat] = coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const key = `${lng.toFixed(7)}:${lat.toFixed(7)}`;
    if (!probes.some((probe) => probe.key === key)) {
      probes.push({ key, coordinates: [lng, lat] });
    }
  };

  register(centroid(feature).geometry?.coordinates);
  const polygonCoordinates =
    feature?.geometry?.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature?.geometry?.type === "MultiPolygon"
        ? feature.geometry.coordinates
        : [];

  polygonCoordinates.forEach((polygon) => {
    const firstRing = polygon?.[0] || [];
    if (!firstRing.length) return;
    const sampleIndexes = [0, Math.floor(firstRing.length / 3), Math.floor((firstRing.length * 2) / 3)];
    sampleIndexes.forEach((index) => {
      register(firstRing[index]);
    });
  });

  return probes;
}

function projectLngLatTo3857(lng, lat) {
  const rad = Math.PI / 180;
  const clampedLat = Math.max(Math.min(lat, 89.999999), -89.999999);
  const x = EARTH_RADIUS * lng * rad;
  const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (clampedLat * rad) / 2));
  return [x, y];
}

function buildFeatureInfoUrl(def, map, point) {
  const info = def?.featureInfo;
  if (!info || !info.url || !info.layerName || !map || !point) {
    return null;
  }

  const version = info.version || "1.3.0";
  const isVersion130 = version === "1.3.0";

  const canvas = typeof map.getCanvas === "function" ? map.getCanvas() : null;
  const bounds = typeof map.getBounds === "function" ? map.getBounds() : null;
  if (!canvas || !bounds) {
    return null;
  }

  const sw = typeof bounds.getSouthWest === "function" ? bounds.getSouthWest() : bounds._sw;
  const ne = typeof bounds.getNorthEast === "function" ? bounds.getNorthEast() : bounds._ne;
  if (!sw || !ne) {
    return null;
  }

  const [minX, minY] = projectLngLatTo3857(sw.lng, sw.lat);
  const [maxX, maxY] = projectLngLatTo3857(ne.lng, ne.lat);
  const bbox = `${minX},${minY},${maxX},${maxY}`;

  const width = Math.round(canvas.width || canvas.clientWidth || 256);
  const height = Math.round(canvas.height || canvas.clientHeight || 256);
  const i = Math.round(point.x);
  const j = Math.round(point.y);

  let url;
  try {
    url = new URL(info.url);
  } catch {
    return null;
  }

  const params = url.searchParams;
  params.set("SERVICE", "WMS");
  params.set("REQUEST", "GetFeatureInfo");
  params.set("VERSION", version);
  params.set("LAYERS", info.layerName);
  params.set(
    "QUERY_LAYERS",
    Array.isArray(info.queryLayers) && info.queryLayers.length > 0
      ? info.queryLayers.join(",")
      : info.layerName,
  );
  params.set("STYLES", info.styles || "");
  params.set(isVersion130 ? "CRS" : "SRS", info.crs || "EPSG:3857");
  params.set("INFO_FORMAT", info.infoFormat || "application/json");
  params.set("I", String(i));
  params.set("J", String(j));
  params.set("WIDTH", String(width));
  params.set("HEIGHT", String(height));
  params.set("BBOX", bbox);

  if (info.extraParams && typeof info.extraParams === "object") {
    Object.entries(info.extraParams).forEach(([key, value]) => {
      if (value != null) {
        params.set(key, String(value));
      }
    });
  }

  return url.toString();
}

export default function ParcellesEditorMap() {
  const {
    mapRef,
    drawRef,
    features,
    setFeatures,
    selectedId,
    selectFeatureOnMap,
    selectFeaturesOnMap,
    setDrawFeatures,
    mapInitError,
    drawReady,
  } = useMapInitialization();
  const {
    parcellesCollection,
    setFeatureCollection,
    reset: resetParcellesStore,
    loading: parcellesLoading,
  } = useParcelles();

  const { fillToponymieNames, isNaming: isToponymieNaming } = useToponymieAutoNaming(setFeatures);

  // Onglets + panneau latéral repliable
  const [sideOpen, setSideOpen] = useState(true);          // panneau latéral ouvert/fermé
  const [sideExpanded, setSideExpanded] = useState(false); // largeur étendue pour le tableau
  const [activeTab, setActiveTab] = useState("parcelles"); // "parcelles" | "calques" | "mapping-sols"
  const [parcelleViewMode, setParcelleViewMode] = useState("cards"); // "cards" | "table"
  const [soilMappingParcelCandidates, setSoilMappingParcelCandidates] = useState([]);
  const [soilMappingRefreshTick, setSoilMappingRefreshTick] = useState(0);
  const [soilMappingLoading, setSoilMappingLoading] = useState(false);
  const soilMappingDebugLoggedRef = useRef(false);
  const [compact, setCompact] = useState(false);
  const [rrpVisible, setRrpVisible] = useState(false);
  const [rrpOpacity, setRrpOpacity] = useState(DEFAULT_FILL_OPACITY);
  const [geoportalOpacity, setGeoportalOpacity] = useState(
    GEO_PORTAIL_SOIL_DEFAULT_OPACITY
  );
  const [freezeTiles, setFreezeTiles] = useState(false);
  const [layerState, setLayerState] = useState(() => {
    const initial = {};
    RASTER_LAYERS.forEach((def) => {
      initial[def.id] = {
        visible: def.defaultVisible ?? false,
        opacity: def.defaultOpacity ?? 1,
      };
    });
    return initial;
  });
  const [soilGridsGridVisible, setSoilGridsGridVisible] = useState(false);
  const [soilGridsGridMeta, setSoilGridsGridMeta] = useState(null);
  const [soilGridsGridError, setSoilGridsGridError] = useState(null);
  const soilGridsGridAbortRef = useRef(null);
  const soilGridsGridRequestRef = useRef(0);
  const soilGridsGridPopupRef = useRef(null);
  const [mapClickInfo, setMapClickInfo] = useState(null);
  const [appWarnings, setAppWarnings] = useState([]);
  const defaultCsvCode = useMemo(
    () => String(Math.floor(Math.random() * 99999) + 1).padStart(5, "0"),
    []
  );
  const [csvValues, setCsvValues] = useState({
    secteur: "TEST",
    exploitation: "Exploitation 1",
    codeExploitation: defaultCsvCode,
  });
  const [parcelleYearFilter, setParcelleYearFilter] = useState("all");
  const [parcelleGroupFilter, setParcelleGroupFilter] = useState("all");
  const [matchViewOpen, setMatchViewOpen] = useState(false);
  const [matchYears, setMatchYears] = useState({ left: null, right: null });
  const [validatedMatches, setValidatedMatches] = useState([]);
  const [validatedMatchesAt, setValidatedMatchesAt] = useState(null);
  const drawLayerFiltersRef = useRef(new Map());
  const drawLayerAppliedFiltersRef = useRef(new Map());
  const toolbarScrollRef = useRef(null);
  const [backendReady, setBackendReady] = useState(false);
  const lastSavedPayloadRef = useRef("");
  const lastSyncedPayloadRef = useRef("");
  const hasHydratedRef = useRef(false);
  const isUnmountingRef = useRef(false);
  const drawSyncRef = useRef(false);
  const drawSyncEventRef = useRef(null);
  const suppressDrawSyncRef = useRef(false);
  const emptyParcellesCollection = useMemo(
    () => ({ type: "FeatureCollection", features: [] }),
    []
  );
  const buildCollectionFromFeatures = useCallback((inputFeatures) => ({
    type: "FeatureCollection",
    features: (inputFeatures || []).map((feature) => ({
      type: "Feature",
      id: feature.id,
      geometry: feature.geometry,
      properties: feature.properties || {},
    })),
  }), []);
  const yearOptions = useMemo(() => {
    const years = new Set();
    let hasUnknown = false;
    features.forEach((feature) => {
      const parsedYear = normalizeYearValue(feature?.properties?.annee);
      if (parsedYear != null) {
        years.add(parsedYear);
      } else {
        hasUnknown = true;
      }
    });
    return {
      years: Array.from(years).sort((a, b) => b - a),
      hasUnknown,
    };
  }, [features]);

  const groupOptions = useMemo(() => {
    const groups = new Set();
    let hasUngrouped = false;
    features.forEach((feature) => {
      const value = feature?.properties?.layerType;
      if (value == null || String(value).trim() === "") {
        hasUngrouped = true;
        return;
      }
      groups.add(String(value).trim());
    });
    return {
      groups: Array.from(groups).sort((a, b) => a.localeCompare(b)),
      hasUngrouped,
    };
  }, [features]);

  useEffect(() => {
    if (!sideOpen) {
      setSideExpanded(false);
    }
  }, [sideOpen]);

  useEffect(() => {
    const { changed, nextFeatures } = ensureFeaturesHaveYear(features);
    if (!changed) return;
    setFeatures(nextFeatures);
  }, [features, setFeatures]);

  useEffect(() => {
    if (parcelleYearFilter === "all" || parcelleYearFilter === "unknown") {
      return;
    }
    if (!yearOptions.years.includes(Number(parcelleYearFilter))) {
      setParcelleYearFilter("all");
    }
  }, [parcelleYearFilter, yearOptions.years]);

  useEffect(() => {
    if (parcelleGroupFilter === "all" || parcelleGroupFilter === "ungrouped") {
      return;
    }
    if (!groupOptions.groups.includes(parcelleGroupFilter)) {
      setParcelleGroupFilter("all");
    }
  }, [parcelleGroupFilter, groupOptions.groups]);

  useEffect(() => {
    if (parcelleViewMode === "table" && sideOpen) {
      setSideExpanded(true);
    } else if (parcelleViewMode !== "table") {
      setSideExpanded(false);
    }
  }, [parcelleViewMode, sideOpen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyFilter = () => {
      const filterValue = parcelleYearFilter;
      let yearFilter = null;
      const yearExpr = ["to-number", ["get", "annee"], INVALID_YEAR];
      if (filterValue === "unknown") {
        yearFilter = ["==", yearExpr, INVALID_YEAR];
      } else if (filterValue !== "all") {
        const parsed = normalizeYearValue(filterValue);
        if (parsed != null) {
          yearFilter = ["==", yearExpr, parsed];
        }
      }

      let groupFilter = null;
      if (parcelleGroupFilter === "ungrouped") {
        groupFilter = [
          "any",
          ["!", ["has", "layerType"]],
          ["==", ["get", "layerType"], ""],
        ];
      } else if (parcelleGroupFilter !== "all") {
        groupFilter = ["==", ["get", "layerType"], parcelleGroupFilter];
      }

      const layerIds = DRAW_LAYER_IDS.flatMap((layerId) =>
        DRAW_LAYER_VARIANTS.map((suffix) => `${layerId}${suffix}`)
      );
      layerIds.forEach((layerId) => {
        if (!map.getLayer(layerId)) return;
        const stored = drawLayerFiltersRef.current.get(layerId);
        const baseFilter = stored ?? map.getFilter(layerId) ?? null;
        if (!stored) {
          drawLayerFiltersRef.current.set(layerId, baseFilter);
        }
        const filters = [baseFilter, yearFilter, groupFilter].filter(Boolean);
        const nextFilter = filters.length
          ? filters.length === 1
            ? filters[0]
            : ["all", ...filters]
          : null;
        const previousApplied = drawLayerAppliedFiltersRef.current.get(layerId);
        const previousSerialized =
          previousApplied == null ? "__NULL__" : JSON.stringify(previousApplied);
        const nextSerialized = nextFilter == null ? "__NULL__" : JSON.stringify(nextFilter);
        if (previousSerialized === nextSerialized) return;
        map.setFilter(layerId, nextFilter);
        drawLayerAppliedFiltersRef.current.set(layerId, nextFilter);
      });
    };

    applyFilter();
  }, [mapRef, parcelleYearFilter, parcelleGroupFilter]);

  const visibleFeatures = useMemo(() => {
    const yearFilter = parcelleYearFilter;
    const groupFilter = parcelleGroupFilter;
    return features.filter((feature) => {
      const yearValue = normalizeYearValue(feature?.properties?.annee);
      if (yearFilter === "unknown") {
        if (yearValue != null) return false;
      } else if (yearFilter !== "all") {
        const parsed = normalizeYearValue(yearFilter);
        if (parsed != null && yearValue !== parsed) return false;
      }

      const groupValue = String(feature?.properties?.layerType ?? "").trim();
      if (groupFilter === "ungrouped") {
        if (groupValue) return false;
      } else if (groupFilter !== "all") {
        if (groupValue !== groupFilter) return false;
      }
      return true;
    });
  }, [features, parcelleYearFilter, parcelleGroupFilter]);

  // ✅ expose maplibregl pour les popups utilisés par le hook local
  useEffect(() => {
    (window).maplibregl = maplibregl;
  }, []);

  useEffect(() => {
    const warnings = [];
    if (
      typeof window !== "undefined" &&
      (window.CODEBOOK_EXTRA == null || typeof window.CODEBOOK_EXTRA !== "object")
    ) {
      warnings.push({
        code: ERROR_CODES.CODEBOOK_MISSING,
        message: "codebookV2.js est absent ou invalide (labels cultures indisponibles).",
      });
    }
    if (
      typeof window !== "undefined" &&
      (window.CULTURE_COLORS == null || typeof window.CULTURE_COLORS !== "object")
    ) {
      warnings.push({
        code: ERROR_CODES.COLORBOOK_MISSING,
        message: "colorbook.js est absent ou invalide (couleurs cultures indisponibles).",
      });
    }
    if (warnings.length) {
      setAppWarnings(warnings);
      warnings.forEach((warning) =>
        console.warn(`[${warning.code}] ${warning.message}`)
      );
    }
  }, []);

  useEffect(() => {
    if (parcellesLoading) return;
    const nextCollection = parcellesCollection || emptyParcellesCollection;
    setDrawFeatures(nextCollection);
    lastSavedPayloadRef.current = JSON.stringify(nextCollection);
    lastSyncedPayloadRef.current = JSON.stringify(nextCollection);
    hasHydratedRef.current = true;
    setBackendReady(true);
  }, [
    parcellesCollection,
    parcellesLoading,
    emptyParcellesCollection,
    setDrawFeatures,
  ]);

  const handleResetParcelles = useCallback(async () => {
    setDrawFeatures(emptyParcellesCollection);
    lastSavedPayloadRef.current = JSON.stringify(emptyParcellesCollection);
    lastSyncedPayloadRef.current = JSON.stringify(emptyParcellesCollection);
    resetParcellesStore();
    try {
      await clearParcellesGeojson();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      console.warn(`[PARCELLES_RESET_FAILED] Réinitialisation backend impossible: ${message}`);
    }
  }, [
    emptyParcellesCollection,
    resetParcellesStore,
    setDrawFeatures,
  ]);

  useEffect(() => {
    if (!backendReady) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      const payload = {
        type: "FeatureCollection",
        features: features.map((feature) => ({
          type: "Feature",
          id: feature.id,
          geometry: feature.geometry,
          properties: feature.properties || {},
        })),
      };
      const serialized = JSON.stringify(payload);
      if (serialized === lastSavedPayloadRef.current) return;
      saveParcellesGeojson(features, controller.signal)
        .then((collection) => {
          lastSavedPayloadRef.current = JSON.stringify(collection);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Erreur inconnue";
          console.warn(`[PARCELLES_SAVE_FAILED] Enregistrement impossible: ${message}`);
        });
    }, 500);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [backendReady, features]);

  useEffect(() => {
    if (!hasHydratedRef.current) return;
    if (isUnmountingRef.current) return;
    const payload = buildCollectionFromFeatures(features);
    const serialized = JSON.stringify(payload);
    if (serialized === lastSyncedPayloadRef.current) return;
    const hasFeatures = payload.features.length > 0;
    const storeHasFeatures = (parcellesCollection?.features?.length ?? 0) > 0;
    const isFromDraw = drawSyncRef.current;
    const lastDrawEvent = drawSyncEventRef.current;
    drawSyncRef.current = false;
    drawSyncEventRef.current = null;
    if (!hasFeatures && storeHasFeatures && !isFromDraw && lastDrawEvent !== "draw.delete") {
      return;
    }
    lastSyncedPayloadRef.current = serialized;
    setFeatureCollection(payload);

    if (!isFromDraw && drawReady) {
      const draw = drawRef.current;
      if (draw && typeof draw.set === "function") {
        suppressDrawSyncRef.current = true;
        draw.set(payload);
      }
    }
  }, [
    buildCollectionFromFeatures,
    drawReady,
    drawRef,
    features,
    parcellesCollection,
    setFeatureCollection,
  ]);

  useEffect(() => () => {
    isUnmountingRef.current = true;
    const draw = drawRef.current;
    if (!draw || typeof draw.getAll !== "function") return;
    let data = null;
    try {
      data = draw.getAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      console.warn(`[DRAW_SNAPSHOT_FAILED] Lecture Mapbox Draw impossible: ${message}`);
      return;
    }
    if (!data) return;
    const payload = buildCollectionFromFeatures(data?.features || []);
    lastSyncedPayloadRef.current = JSON.stringify(payload);
    setFeatureCollection(payload);
  }, [buildCollectionFromFeatures, drawRef, setFeatureCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markDrawSync = (event) => {
      if (suppressDrawSyncRef.current) {
        suppressDrawSyncRef.current = false;
        return;
      }
      drawSyncRef.current = true;
      drawSyncEventRef.current = event?.type || "draw.update";
    };
    map.on("draw.create", markDrawSync);
    map.on("draw.update", markDrawSync);
    map.on("draw.delete", markDrawSync);
    return () => {
      map.off("draw.create", markDrawSync);
      map.off("draw.update", markDrawSync);
      map.off("draw.delete", markDrawSync);
    };
  }, [mapRef]);

  // ✅ Charge la couche RRP France depuis un fichier MBTiles local (placer le fichier dans /public/data/)
  //    Exemple : public/data/rrp_france_wgs84_shp.mbtiles
  const {
    polygonsShown,
    loadingTiles,
    freezeCurrentTile,
    frozenTiles,
    removeFrozenTile,
    clearFrozenTiles,
    currentTileSummary,
  } = useSoilLayerLocal({
    map: mapRef.current,
    dataPath: withBasePath("/data/soilmap_dep"),
    sourceId: "soils-rrp",
    fillLayerId: "soils-rrp-fill",
    lineLayerId: "soils-rrp-outline",
    labelLayerId: "soils-rrp-label",
    zIndex: 10,
    visible: rrpVisible,
    fillOpacity: rrpOpacity,
    freezeTiles,
    geoportalOpacity,
  });

  const mapInstance = mapRef.current;
  const infoAbortControllers = useRef([]);
  const lastInfoRequestRef = useRef(0);
  const infoEnabledDefs = useMemo(
    () => RASTER_LAYERS.filter((def) => def.featureInfo),
    [],
  );

  const ensureSoilGridsGridLayer = useCallback(() => {
    if (!mapInstance || !mapInstance.isStyleLoaded()) return false;

    if (!mapInstance.getSource(SOILGRIDS_GRID_SOURCE_ID)) {
      mapInstance.addSource(SOILGRIDS_GRID_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_COLLECTION,
      });
    }

    if (!mapInstance.getLayer(SOILGRIDS_GRID_LAYER_ID)) {
      mapInstance.addLayer({
        id: SOILGRIDS_GRID_LAYER_ID,
        type: "line",
        source: SOILGRIDS_GRID_SOURCE_ID,
        paint: {
          "line-color": "#ef4444",
          "line-opacity": 0.6,
          "line-width": 1,
        },
        layout: {
          visibility: soilGridsGridVisible ? "visible" : "none",
        },
      });
    }

    return true;
  }, [mapInstance, soilGridsGridVisible]);

  const refreshSoilGridsGrid = useCallback(() => {
    if (!mapInstance || !soilGridsGridVisible) return;
    if (!ensureSoilGridsGridLayer()) return;

    const bounds = mapInstance.getBounds?.();
    if (!bounds) return;

    const bbox = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];

    if (soilGridsGridAbortRef.current) {
      soilGridsGridAbortRef.current.abort();
    }
    const controller = new AbortController();
    soilGridsGridAbortRef.current = controller;

    const requestId = soilGridsGridRequestRef.current + 1;
    soilGridsGridRequestRef.current = requestId;
    setSoilGridsGridError(null);

    fetchSoilGridsVisibleGrid({ bbox, limit: 6000, signal: controller.signal })
      .then((payload) => {
        if (requestId !== soilGridsGridRequestRef.current) return;
        const source = mapInstance.getSource(SOILGRIDS_GRID_SOURCE_ID);
        if (source?.setData) {
          source.setData(payload?.collection || EMPTY_COLLECTION);
        }
        setSoilGridsGridMeta({
          featureCount: payload?.featureCount ?? 0,
          truncated: !!payload?.truncated,
          coverageId: payload?.metadata?.coverageId || null,
          crs: payload?.metadata?.crs || "EPSG:4326",
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (requestId !== soilGridsGridRequestRef.current) return;
        const source = mapInstance.getSource(SOILGRIDS_GRID_SOURCE_ID);
        if (source?.setData) {
          source.setData(EMPTY_COLLECTION);
        }
        setSoilGridsGridMeta(null);
        setSoilGridsGridError(error?.message || "Erreur de chargement de la grille SoilGrids");
      });
  }, [mapInstance, soilGridsGridVisible, ensureSoilGridsGridLayer]);

  useEffect(() => {
    if (!mapInstance) return;

    if (!mapInstance.isStyleLoaded()) {
      const onLoad = () => {
        ensureSoilGridsGridLayer();
      };
      mapInstance.once("load", onLoad);
      return () => mapInstance.off("load", onLoad);
    }

    ensureSoilGridsGridLayer();
  }, [mapInstance, ensureSoilGridsGridLayer]);

  useEffect(() => {
    if (!mapInstance || !mapInstance.getLayer(SOILGRIDS_GRID_LAYER_ID)) return;

    mapInstance.setLayoutProperty(
      SOILGRIDS_GRID_LAYER_ID,
      "visibility",
      soilGridsGridVisible ? "visible" : "none",
    );

    if (!soilGridsGridVisible) {
      if (soilGridsGridAbortRef.current) {
        soilGridsGridAbortRef.current.abort();
      }
      const source = mapInstance.getSource(SOILGRIDS_GRID_SOURCE_ID);
      if (source?.setData) source.setData(EMPTY_COLLECTION);
      setSoilGridsGridMeta(null);
      setSoilGridsGridError(null);
      if (soilGridsGridPopupRef.current) {
        soilGridsGridPopupRef.current.remove();
        soilGridsGridPopupRef.current = null;
      }
      return;
    }

    refreshSoilGridsGrid();
  }, [mapInstance, soilGridsGridVisible, refreshSoilGridsGrid]);

  useEffect(() => {
    if (!mapInstance || !soilGridsGridVisible) return;
    let timer = null;

    const handleMoveEnd = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        refreshSoilGridsGrid();
      }, 120);
    };

    mapInstance.on("moveend", handleMoveEnd);
    return () => {
      mapInstance.off("moveend", handleMoveEnd);
      clearTimeout(timer);
    };
  }, [mapInstance, soilGridsGridVisible, refreshSoilGridsGrid]);

  useEffect(() => {
    if (!mapInstance) return;

    const parseBboxValue = (value) => {
      if (Array.isArray(value) && value.length === 4) return value.map((item) => Number(item));
      if (typeof value !== "string") return null;
      const values = value.split(",").map((item) => Number(item.trim()));
      if (values.length !== 4 || values.some((item) => !Number.isFinite(item))) return null;
      return values;
    };

    const handleGridClick = (event) => {
      const feature = event?.features?.[0];
      if (!feature) return;
      const props = feature.properties || {};
      const centerLon = Number(props?.centerLon);
      const centerLat = Number(props?.centerLat);
      const center = Number.isFinite(centerLon) && Number.isFinite(centerLat) ? [centerLon, centerLat] : null;
      const bbox = parseBboxValue(props?.bboxWgs84);

      const html = [
        `<strong>${props.pixelId || "Pixel SoilGrids"}</strong>`,
        `Ligne / colonne : ${props.row ?? "?"} / ${props.col ?? "?"}`,
        center ? `Centre : ${Number(center[1]).toFixed(6)}, ${Number(center[0]).toFixed(6)}` : null,
        Array.isArray(bbox)
          ? `BBox : ${bbox.map((v) => Number(v).toFixed(6)).join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("<br />");

      if (soilGridsGridPopupRef.current) {
        soilGridsGridPopupRef.current.remove();
      }
      soilGridsGridPopupRef.current = new maplibregl.Popup({ closeButton: true })
        .setLngLat(event.lngLat)
        .setHTML(`<div style="font-size:12px;">${html}</div>`)
        .addTo(mapInstance);
    };

    const handleMouseEnter = () => {
      mapInstance.getCanvas().style.cursor = "pointer";
    };
    const handleMouseLeave = () => {
      mapInstance.getCanvas().style.cursor = "";
    };

    const bindLayerEvents = () => {
      if (!mapInstance.getLayer(SOILGRIDS_GRID_LAYER_ID)) return false;
      mapInstance.on("click", SOILGRIDS_GRID_LAYER_ID, handleGridClick);
      mapInstance.on("mouseenter", SOILGRIDS_GRID_LAYER_ID, handleMouseEnter);
      mapInstance.on("mouseleave", SOILGRIDS_GRID_LAYER_ID, handleMouseLeave);
      return true;
    };

    let bound = bindLayerEvents();
    const handleStyleData = () => {
      if (!bound) {
        bound = bindLayerEvents();
      }
    };
    if (!bound) {
      mapInstance.on("styledata", handleStyleData);
    }

    return () => {
      if (bound) {
        mapInstance.off("click", SOILGRIDS_GRID_LAYER_ID, handleGridClick);
        mapInstance.off("mouseenter", SOILGRIDS_GRID_LAYER_ID, handleMouseEnter);
        mapInstance.off("mouseleave", SOILGRIDS_GRID_LAYER_ID, handleMouseLeave);
      }
      mapInstance.off("styledata", handleStyleData);
      if (soilGridsGridPopupRef.current) {
        soilGridsGridPopupRef.current.remove();
        soilGridsGridPopupRef.current = null;
      }
    };
  }, [mapInstance]);
  useEffect(() => () => {
    infoAbortControllers.current.forEach((controller) => controller.abort());
    infoAbortControllers.current = [];
    if (soilGridsGridAbortRef.current) {
      soilGridsGridAbortRef.current.abort();
      soilGridsGridAbortRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!mapInstance) return;

    const handleClick = (event) => {
      const visibleInfoDefs = infoEnabledDefs.filter(
        (def) => layerState[def.id]?.visible,
      );
      const querySoils = rrpVisible;

      if (!querySoils && visibleInfoDefs.length === 0) {
        setMapClickInfo(null);
        return;
      }

      infoAbortControllers.current.forEach((controller) => controller.abort());
      infoAbortControllers.current = [];

      const requestId = lastInfoRequestRef.current + 1;
      lastInfoRequestRef.current = requestId;

      const lngLat =
        event.lngLat && typeof event.lngLat.wrap === "function"
          ? event.lngLat.wrap()
          : event.lngLat;

      setMapClickInfo({
        requestId,
        lngLat,
        soils: querySoils ? { loading: true, features: [] } : null,
        layers: [
          ...visibleInfoDefs.map((def) => ({
            id: def.id,
            label: def.label,
            loading: true,
            error: null,
            data: null,
          })),
        ],
      });

      if (querySoils) {
        const soilFeatures = mapInstance.queryRenderedFeatures(event.point, {
          layers: ["soils-rrp-fill"],
        });
        const items = soilFeatures.map((feature, idx) => ({
          id:
            feature.id ??
            feature.properties?.id ??
            feature.properties?.ID ??
            `${feature.source}-${feature.sourceLayer ?? ""}-${idx}`,
          properties: { ...(feature.properties ?? {}) },
        }));

        setMapClickInfo((prev) => {
          if (!prev || prev.requestId !== requestId) return prev;
          return {
            ...prev,
            soils: { loading: false, features: items },
          };
        });
      }

      visibleInfoDefs.forEach((def) => {
        const requestUrl = buildFeatureInfoUrl(def, mapInstance, event.point);
        if (!requestUrl) {
          setMapClickInfo((prev) => {
            if (!prev || prev.requestId !== requestId) return prev;
            return {
              ...prev,
              layers: (prev.layers || []).map((layer) =>
                layer.id === def.id
                  ? {
                      ...layer,
                      loading: false,
                      error: "URL non valide",
                    }
                  : layer,
              ),
            };
          });
          return;
        }

        const controller = new AbortController();
        infoAbortControllers.current.push(controller);

        fetch(requestUrl, { signal: controller.signal })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              return response.json();
            }
            return response.text().then((text) => ({ text }));
          })
          .then((payload) => {
            const parser = def.featureInfo?.parser || DEFAULT_FEATURE_INFO_PARSER;
            const parsed =
              typeof parser === "function" ? parser(payload, { layer: def }) : payload;

            setMapClickInfo((prev) => {
              if (!prev || prev.requestId !== requestId) return prev;
              return {
                ...prev,
                layers: (prev.layers || []).map((layer) =>
                  layer.id === def.id
                    ? {
                        ...layer,
                        loading: false,
                        error: null,
                        data: parsed,
                      }
                    : layer,
                ),
              };
            });
          })
          .catch((error) => {
            if (controller.signal.aborted) {
              return;
            }
            setMapClickInfo((prev) => {
              if (!prev || prev.requestId !== requestId) return prev;
              return {
                ...prev,
                layers: (prev.layers || []).map((layer) =>
                  layer.id === def.id
                    ? {
                        ...layer,
                        loading: false,
                        error: error.message || "Erreur inconnue",
                      }
                    : layer,
                ),
              };
            });
          })
          .finally(() => {
            infoAbortControllers.current = infoAbortControllers.current.filter(
              (ctrl) => ctrl !== controller,
            );
          });
      });
    };

    mapInstance.on("click", handleClick);

    return () => {
      mapInstance.off("click", handleClick);
    };
  }, [
    mapInstance,
    infoEnabledDefs,
    layerState,
    rrpVisible,
  ]);

  useEffect(() => {
    setMapClickInfo((prev) => {
      if (!prev) return prev;

      const visibleInfoIds = new Set(
        infoEnabledDefs
          .filter((def) => layerState[def.id]?.visible)
          .map((def) => def.id),
      );
      const layers = (prev.layers || []).filter(
        (layer) => visibleInfoIds.has(layer.id),
      );
      const soils = rrpVisible ? prev.soils : null;

      if (layers.length === (prev.layers || []).length && soils === prev.soils) {
        return prev;
      }

      if (!soils && layers.length === 0) {
        return null;
      }

      return { ...prev, layers, soils };
    });
  }, [layerState, rrpVisible, infoEnabledDefs]);

  const totalFrozenFeatures = useMemo(
    () => frozenTiles.reduce((acc, tile) => acc + tile.features.length, 0),
    [frozenTiles]
  );

  const totalVisibleFeatures =
    totalFrozenFeatures + (currentTileSummary?.featureCount ?? 0);

  const soilStatusLabel = (() => {
    if (!rrpVisible) return "couche désactivée";
    if (loadingTiles) return "chargement des tuiles…";
    if (freezeTiles && totalVisibleFeatures === 0)
      return "rechargement en pause – aucune tuile visible";
    if (freezeTiles) return "rechargement en pause";
    if (totalVisibleFeatures === 0) return "aucune tuile visible";
    if (frozenTiles.length > 0) {
      return `tuiles figées (${frozenTiles.length}) + tuile active`;
    }
    return polygonsShown ? "tuile active affichée" : "aucune tuile visible";
  })();

  const canFreezeCurrentTile = Boolean(currentTileSummary?.featureCount);

  const handleCloseInfoPanel = () => {
    infoAbortControllers.current.forEach((controller) => controller.abort());
    infoAbortControllers.current = [];
    setMapClickInfo(null);
  };

  const handleLayerToggle = (id, visible) => {
    setLayerState((prev) => ({
      ...prev,
      [id]: {
        ...(prev?.[id] || {}),
        visible,
      },
    }));
  };

  const handleLayerOpacityChange = (id, value) => {
    setLayerState((prev) => ({
      ...prev,
      [id]: {
        ...(prev?.[id] || {}),
        opacity: value,
      },
    }));
  };

  const handleOpenParcelleMatch = () => {
    if (yearOptions.years.length < 2) {
      alert("Il faut au moins deux années pour comparer les parcelles.");
      return;
    }
    setMatchYears((prev) => ({
      left: prev.left ?? yearOptions.years[0],
      right: prev.right ?? yearOptions.years[1],
    }));
    setMatchViewOpen(true);
  };

  const handleValidateParcelleMatch = async (payload) => {
    const rows = Array.isArray(payload) ? payload : payload?.rows ?? [];
    const leftYear = Array.isArray(payload) ? null : payload?.leftYear ?? null;
    const rightYear = Array.isArray(payload) ? null : payload?.rightYear ?? null;

    const leftYearValue = normalizeYearValue(leftYear);
    const rightYearValue = normalizeYearValue(rightYear);
    if (!rows.length || leftYearValue == null || rightYearValue == null) return false;
    if (leftYearValue === rightYearValue) return false;

    // Gauche = conservée (newYear), Droite = disparaissant (oldYear)
    const keptYear = leftYearValue;
    const disappearingYear = rightYearValue;

    const correspondancesValidated = {};
    const matchesPayload = rows.flatMap((row) => {
      if (!row?.disappearingKey || !row?.keptKey) return [];
      // disappearingKey = droite (disparaît) = oldKey ; keptKey = gauche (conservée) = newKey
      correspondancesValidated[String(row.disappearingKey)] = String(row.keptKey);
      return [
        {
          oldId: String(row.disappearingKey),
          newId: String(row.keptKey),
          previousValue: row?.previousValue ?? null,
        },
      ];
    });

    const applyLocalMerge = () => {
      setFeatures((prev) => {
        const next = Array.isArray(prev) ? prev : [];
        if (!next.length) return next;
        const parcellesByYear = buildParcellesByYearFromFeatures(next);
        const {
          parcellesByYear: mergedParcellesByYear,
          removedOldKeys,
          updatedNewByKey,
        } =
          applyCorrespondencesAndMerge({
            parcellesByYear,
            oldYear: disappearingYear,
            newYear: keptYear,
            correspondancesValidated,
            dropOldYear: true,
          });

        const mergedById = new Map();
        const removedOldKeySet = removedOldKeys ?? new Set();
        Object.values(mergedParcellesByYear || {}).forEach((collection) => {
          (collection?.features || []).forEach((feature) => {
            const id = getFeatureId(feature);
            if (id != null) {
              mergedById.set(String(id), feature);
            }
          });
        });

        return next
          .map((feature, index) => {
            const featureKey = getFeatureKey(feature, index);
            if (removedOldKeySet.has(String(featureKey))) {
              return null;
            }
            const id = getFeatureId(feature);
            if (id == null) {
              return updatedNewByKey?.get(String(featureKey)) ?? feature;
            }
            if (mergedById.has(String(id))) {
              return mergedById.get(String(id));
            }
            return updatedNewByKey?.get(String(featureKey)) ?? feature;
          })
          .filter(Boolean)
          .filter((feature) => Number(feature?.properties?.annee) !== disappearingYear);
      });
    };

    // Toujours appliquer le merge local en premier : il utilise les features
    // en mémoire (plus récentes que le fichier backend qui peut avoir 500ms de retard).
    applyLocalMerge();
    setValidatedMatches(rows);
    setValidatedMatchesAt(new Date());
    setMatchViewOpen(false);

    // Appel backend uniquement pour la persistance (fire and forget).
    validateParcellesMatching({
      oldYear: disappearingYear,
      newYear: keptYear,
      matches: matchesPayload,
    }).catch((error) => {
      console.warn(
        "Persistance backend indisponible, les correspondances sont appliquées localement.",
        error,
      );
    });

    return true;
  };

  const resolveParcelsWithSoilRows = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !rrpVisible || !map.getLayer("soils-rrp-fill")) {
      throw new Error("Active la couche Carte des sols France avant de visualiser les sols.");
    }
    if (loadingTiles || !polygonsShown) {
      throw new Error("Donn?es sols en cours de chargement.");
    }

    const [lookupBySourceFile, lookupByUcsId] = await Promise.all([
      loadSoilTypeLookupBySourceFile(),
      loadSoilTypeLookupByUcsId(),
    ]);

    return features.map((feature, index) => {
      const areaM2 = featureAreaM2(feature) ?? 0;
      const surfaceHa = areaM2 / 10000;
      const probePoints = buildSoilProbePoints(feature);
      if (!probePoints.length) {
        return { index, feature, soilRow: null, surfaceHa };
      }

      let detectedSoilRow = null;
      for (const probe of probePoints) {
        const point = map.project([probe.coordinates[0], probe.coordinates[1]]);
        const rendered = map.queryRenderedFeatures(point, { layers: ["soils-rrp-fill"] }) || [];
        if (!soilMappingDebugLoggedRef.current && rendered.length) {
          const sample = rendered[0];
          const sampleProps = sample?.properties || {};
          const sampleFileUcs = resolveFileUcs(sampleProps);
          const sampleUcsId = resolveUcsId(sampleProps);
          console.info("[SOIL_DEBUG] sample RRP feature properties", {
            id: sample.id,
            keys: Object.keys(sampleProps),
            fileUcs: sampleFileUcs,
            ucsId: sampleUcsId,
            sampleProps,
          });
          soilMappingDebugLoggedRef.current = true;
        }
        for (const candidate of rendered) {
          const soilProps = candidate?.properties || {};
          const fileUcs = resolveFileUcs(soilProps);
          const ucsId = resolveUcsId(soilProps);
          const row =
            (fileUcs && lookupBySourceFile.get(fileUcs.toLowerCase())) ||
            (ucsId && lookupByUcsId.get(ucsId)) ||
            null;
          if (row) {
            detectedSoilRow = row;
            break;
          }
        }
        if (detectedSoilRow) break;
      }

      return { index, feature, soilRow: detectedSoilRow, surfaceHa };
    });
  }, [features, mapRef, rrpVisible, loadingTiles, polygonsShown]);

  useEffect(() => {
    if (!rrpVisible) {
      setSoilMappingParcelCandidates([]);
      return undefined;
    }
    if (loadingTiles || !polygonsShown) {
      return undefined;
    }
    let cancelled = false;
    // Debounce 300ms : évite N×probes queryRenderedFeatures à chaque frappe/édition
    const timeoutId = setTimeout(() => {
      setSoilMappingLoading(true);
      resolveParcelsWithSoilRows()
        .then((candidates) => {
          if (!cancelled) setSoilMappingParcelCandidates(candidates);
        })
        .catch(() => {
          if (!cancelled) setSoilMappingParcelCandidates([]);
        })
        .finally(() => {
          if (!cancelled) setSoilMappingLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [resolveParcelsWithSoilRows, rrpVisible, loadingTiles, polygonsShown, soilMappingRefreshTick]);

  const refreshSoilMapping = useCallback(() => {
    soilMappingDebugLoggedRef.current = false;
    setSoilMappingRefreshTick((prev) => prev + 1);
  }, []);

  const applySoilMappingToParcels = useCallback((structureName, mapping) => {
    if (!structureName || !mapping) return;
    const combinationMap = mapping?.combinationMap || {};
    const hasMapping = Object.keys(combinationMap).length > 0;
    if (!hasMapping) {
      alert("Aucun mapping defini pour cette structure.");
      return;
    }

    const candidatesByIndex = new Map();
    soilMappingParcelCandidates.forEach((candidate) => {
      if (candidate && Number.isFinite(candidate.index)) {
        candidatesByIndex.set(candidate.index, candidate);
      }
    });

    const nextFeatures = features.map((feature, index) => {
      const candidate = candidatesByIndex.get(index);
      if (!candidate?.soilRow) return feature;
      const key = buildSoilCombinationKey(candidate.soilRow);
      const mappedName = combinationMap[key];
      if (!mappedName) return feature;
      const props = { ...(feature.properties || {}) };
      props.type_sol = mappedName;
      props.TYPE_SOL = mappedName;
      return { ...feature, properties: props };
    });

    setFeatures(nextFeatures);
  }, [features, soilMappingParcelCandidates, setFeatures]);

  // ---- Styles de la barre d’outils bas
  const bottomBarHeight = compact ? 56 : 64;
  const barBase = {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    background: "#fff",
    borderTop: "1px solid #e5e7eb",
    boxShadow: "0 -6px 20px rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: compact ? "6px 10px" : "10px 14px",
    zIndex: 20,
    minHeight: bottomBarHeight,
  };
  const toolbarScrollWrap = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  };
  const toolbarScrollArea = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    overflowX: "auto",
    paddingBottom: 4,
    marginBottom: -4,
    scrollbarWidth: "thin",
  };
  const navButtonStyle = {
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
  };
  const groupStyle = {
    display: "flex",
    alignItems: "center",
    gap: compact ? 6 : 10,
    paddingRight: compact ? 8 : 14,
    marginRight: compact ? 4 : 8,
    borderRight: "1px solid #eee",
  };
  const btn = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: compact ? "6px 8px" : "8px 12px",
    borderRadius: 8,
    background: "#fff",
    border: "1px solid #d1d5db",
    cursor: "pointer",
    fontSize: 14,
  };
  const label = (t) => (compact ? null : <span>{t}</span>);

  // Petites icônes (chevron uniquement ici)
  const iconStyle = {
    width: 18,
    height: 18,
    display: "inline-block",
    verticalAlign: "-3px",
  };
  const IconChevron = ({ up = false }) => (
    <svg viewBox="0 0 24 24" style={iconStyle}>
      <path d={up ? "M7 14l5-5 5 5" : "M7 10l5 5 5-5"} fill="currentColor" />
    </svg>
  );

  // ---- Layout racine (grille 2 colonnes conditionnelle)
  const layoutStyle = {
    height: "100%",
    position: "relative",
    display: "grid",
    gridTemplateColumns: sideOpen
      ? sideExpanded
        ? "minmax(320px, 45%) minmax(420px, 55%)"
        : "1fr 420px"
      : "1fr 0px",
  };
  const sidePanelHeaderStyle = {
    position: "sticky",
    top: 0,
    background: "#fff",
    paddingBottom: 12,
    zIndex: 1,
    borderBottom: "1px solid #eee",
  };
  const scrollToolbar = (direction) => {
    const el = toolbarScrollRef.current;
    if (!el) return;
    const delta = Math.round(el.clientWidth * 0.7) * direction;
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <div style={layoutStyle}>
      {/* Carte */}
      <div
        id="map"
        style={{
          height: "100dvh",
          width: "100%",
          opacity: matchViewOpen ? 0 : 1,
          pointerEvents: matchViewOpen ? "none" : "auto",
        }}
      />
      {mapInitError && (
        <div
          style={{
            position: "absolute",
            inset: 12,
            zIndex: 30,
            background: "rgba(255,255,255,0.96)",
            border: "1px solid #fca5a5",
            borderRadius: 12,
            padding: 16,
            maxWidth: 520,
            boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, color: "#b91c1c" }}>
            Erreur carte ({mapInitError.code || ERROR_CODES.MAP_INIT_FAILED})
          </h2>
          <p style={{ margin: "8px 0 0", color: "#7f1d1d", fontSize: 13 }}>
            {mapInitError.message ||
              "Impossible d'initialiser la carte. Vérifie la console pour plus de détails."}
          </p>
        </div>
      )}
      {appWarnings.length > 0 && (
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 72,
            zIndex: 25,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid #fde68a",
            borderRadius: 10,
            padding: 12,
            maxWidth: 360,
            fontSize: 12,
            color: "#92400e",
          }}
        >
          <strong>Alertes de configuration</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {appWarnings.map((warning) => (
              <li key={warning.code}>
                [{warning.code}] {warning.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <MapInfoPanel info={mapClickInfo} onClose={handleCloseInfoPanel} />

      {/* Panneau latéral (onglets + repliable) */}
      <div
        style={{
          padding: sideOpen ? 16 : 0,
          paddingBottom: sideOpen ? bottomBarHeight + 24 : 0,
          borderLeft: sideOpen ? "1px solid #eee" : "none",
          overflowY: "auto",
          display: sideOpen && !matchViewOpen ? "block" : "none",
        }}
      >
        <div style={sidePanelHeaderStyle}>
          {/* En-tête + bouton pour replier */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <h1 style={{ margin: 0, fontSize: 18 }}>Assolia Telepac Mapper</h1>
            <button
              onClick={() => {
                setSideOpen(false);
                setParcelleViewMode("cards");
              }}
              title="Replier le panneau"
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #ddd",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              ◀
            </button>
          </div>

          {/* Onglets */}
          <div
            style={{ display: "flex", gap: 6, marginTop: 12, marginBottom: 8 }}
          >
            <button
              onClick={() => setActiveTab("parcelles")}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: activeTab === "parcelles" ? "#eef6ff" : "#fff",
                cursor: "pointer",
              }}
            >
              Parcelles
            </button>
            <button
              onClick={() => setActiveTab("calques")}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: activeTab === "calques" ? "#ffeeeeff" : "#fff",
                cursor: "pointer",
              }}
            >
              Calques
            </button>
            <button
              onClick={() => setActiveTab("mapping-sols")}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: activeTab === "mapping-sols" ? "#ecfeff" : "#fff",
                cursor: "pointer",
              }}
            >
              Sols presentes
            </button>
          </div>

          {activeTab === "parcelles" && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 12, color: "#555" }}>Affichage</span>
              <div
                style={{
                  display: "inline-flex",
                  border: "1px solid #d1d5db",
                  borderRadius: 999,
                  padding: 2,
                  background: "#f9fafb",
                }}
              >
                <button
                  type="button"
                  onClick={() => setParcelleViewMode("cards")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "none",
                    cursor: "pointer",
                    background:
                      parcelleViewMode === "cards" ? "#2563eb" : "transparent",
                    color: parcelleViewMode === "cards" ? "#fff" : "#111",
                    fontSize: 12,
                  }}
                >
                  Fiches
                </button>
                <button
                  type="button"
                  onClick={() => setParcelleViewMode("table")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "none",
                    cursor: "pointer",
                    background:
                      parcelleViewMode === "table" ? "#2563eb" : "transparent",
                    color: parcelleViewMode === "table" ? "#fff" : "#111",
                    fontSize: 12,
                  }}
                >
                  Tableau
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Contenu onglet “Parcelles” */}
        {activeTab === "parcelles" && (
          <>
            <p style={{ color: "#666", marginTop: 0 }}>
              • “Importer XML Télépac” pour charger un export.
              <br />
              • “Dessiner un polygone” pour ajouter une parcelle.
              <br />• “Exporter XML Télépac” pour générer un fichier compatible
              Assolia.
            </p>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 10,
                marginBottom: 12,
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                Association inter-annees
              </div>
              <button
                type="button"
                onClick={handleOpenParcelleMatch}
                disabled={yearOptions.years.length < 2}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: yearOptions.years.length < 2 ? "#f3f4f6" : "#fff",
                  cursor: yearOptions.years.length < 2 ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {yearOptions.years.length < 2
                  ? "Associer les parcelles (2 annees minimum)"
                  : `Associer les parcelles (${yearOptions.years.length} annees detectees)`}
              </button>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#666" }}>
                Ouvre l'interface de comparaison pour valider les associations entre parcelles de millesimes differents.
              </p>
              {validatedMatches.length > 0 && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#334155" }}>
                  Dernière validation : {validatedMatches.length} correspondance
                  {validatedMatches.length > 1 ? "s" : ""} enregistrée
                  {validatedMatches.length > 1 ? "s" : ""}
                  {validatedMatchesAt
                    ? ` à ${validatedMatchesAt.toLocaleTimeString("fr-FR")}`
                    : ""}
                  .
                </p>
              )}
            </div>

            <ParcelleEditor
              features={features}
              visibleFeatures={visibleFeatures}
              setFeatures={setFeatures}
              onFillNames={() => fillToponymieNames(features)}
              isFillingNames={isToponymieNaming}
              selectedId={selectedId}
              onSelect={(id) => selectFeatureOnMap(id, true)}
              drawRef={drawRef}
              mapRef={mapRef}
              viewMode={parcelleViewMode}
              csvValues={csvValues}
              onCsvValuesChange={setCsvValues}
            />

            <p style={{ fontSize: 12, color: "#777", marginTop: 10 }}>
              Astuce : clique une fiche pour surligner la parcelle sur la carte
              (et inversement).
            </p>
          </>
        )}

        {activeTab === "mapping-sols" && (
          <SoilTypeMappingPanel
            parcelCandidates={soilMappingParcelCandidates}
            parcelCount={features.length}
            rrpVisible={rrpVisible}
            loading={soilMappingLoading || loadingTiles}
            onRefresh={refreshSoilMapping}
            onApplyMapping={applySoilMappingToParcels}
            onSelectParcels={(ids) => selectFeaturesOnMap(ids, true)}
          />
        )}

        {/* Calques (hors sols en ligne ; on garde les rasters/basemaps locaux ou tiers) */}
        {activeTab === "calques" && (
          <div style={{ marginTop: 6 }}>
            <span
              style={{ cursor: "default", fontWeight: 600, padding: "6px 0" }}
            >
              Calques
            </span>
            <div style={{ marginTop: 8 }}>
              <RasterToggles
                mapRef={mapRef}
                layerState={layerState}
                onLayerToggle={handleLayerToggle}
                onLayerOpacityChange={handleLayerOpacityChange}
              />
              <div
                style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: 8,
                  marginTop: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={soilGridsGridVisible}
                    onChange={(event) => setSoilGridsGridVisible(event.target.checked)}
                  />
                  <span>Grille SoilGrids</span>
                </label>
                <p style={{ margin: 0, fontSize: 12, color: "#666" }}>
                  Decoupage reel des pixels SoilGrids (WCS) sur l'emprise visible.
                </p>
                {soilGridsGridMeta ? (
                  <p style={{ margin: 0, fontSize: 11, color: "#475569" }}>
                    {soilGridsGridMeta.featureCount} pixel{soilGridsGridMeta.featureCount > 1 ? "s" : ""} affiche
                    {soilGridsGridMeta.featureCount > 1 ? "s" : ""}
                    {soilGridsGridMeta.truncated ? " (limite atteinte)" : ""}
                    {soilGridsGridMeta.coverageId ? ` - ${soilGridsGridMeta.coverageId}` : ""}
                    {soilGridsGridMeta.crs ? ` (${soilGridsGridMeta.crs})` : ""}
                  </p>
                ) : null}
                {soilGridsGridError ? (
                  <p style={{ margin: 0, fontSize: 11, color: "#b91c1c" }}>{soilGridsGridError}</p>
                ) : null}
              </div>
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {/* RPG (autonome) */}
                <RpgFeature mapRef={mapRef} drawRef={drawRef} />
                <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 8,
                    padding: 8,
                    marginTop: 8,
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={rrpVisible}
                      onChange={(e) => setRrpVisible(e.target.checked)}
                    />
                    <span>Carte des sols France</span>
                  </label>
                  <p style={{ color: "#666", fontSize: 12, marginTop: 8 }}>
                    Chargée depuis <code>/public/data/rrp_france_wgs84_shp.mbtiles</code>.
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#666" }}>Opacité</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={rrpOpacity}
                      onInput={(e) => {
                        const v = parseFloat(e.currentTarget.value);
                        setRrpOpacity(v);
                        const map = mapRef.current;
                        if (map) map.setPaintProperty("soils-rrp-fill", "fill-opacity", v);
                      }}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#666" }}>
                      Opacité couleurs Géoportail
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={geoportalOpacity}
                      onInput={(e) => {
                        const v = parseFloat(e.currentTarget.value);
                        setGeoportalOpacity(v);
                      }}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12,
                        color: "#444",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={freezeTiles}
                        onChange={(e) => setFreezeTiles(e.target.checked)}
                        disabled={!rrpVisible}
                      />
                      <span>Mettre en pause le rechargement automatique</span>
                    </label>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontSize: 12,
                      color: "#444",
                      marginTop: 8,
                    }}
                  >
                    <div>Statut : {soilStatusLabel}</div>
                    <div>
                      Tuile visible : {currentTileSummary
                        ? `${currentTileSummary.featureCount} polygone${
                            currentTileSummary.featureCount > 1 ? "s" : ""
                          }`
                        : "—"}
                    </div>
                    <div>
                      Tuiles figées : {frozenTiles.length} ({totalFrozenFeatures} polygone
                      {totalFrozenFeatures > 1 ? "s" : ""})
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      marginTop: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => freezeCurrentTile()}
                      disabled={!rrpVisible || !canFreezeCurrentTile}
                      style={{
                        padding: "6px 10px",
                        fontSize: 12,
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        background: canFreezeCurrentTile ? "#fff" : "#f3f4f6",
                        cursor:
                          rrpVisible && canFreezeCurrentTile ? "pointer" : "not-allowed",
                        opacity: rrpVisible && canFreezeCurrentTile ? 1 : 0.6,
                        transition: "background-color 0.2s ease",
                      }}
                      title="Ajoute la tuile actuellement visible à la liste des tuiles figées"
                    >
                      Figer la tuile visible
                    </button>
                    <button
                      type="button"
                      onClick={() => clearFrozenTiles()}
                      disabled={!frozenTiles.length}
                      style={{
                        padding: "6px 10px",
                        fontSize: 12,
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        background: frozenTiles.length ? "#fff" : "#f3f4f6",
                        cursor: frozenTiles.length ? "pointer" : "not-allowed",
                        opacity: frozenTiles.length ? 1 : 0.6,
                      }}
                      title="Supprime toutes les tuiles figées"
                    >
                      Vider les tuiles figées
                    </button>
                  </div>
                  {frozenTiles.length > 0 && (
                    <div
                      style={{
                        marginTop: 10,
                        borderTop: "1px solid #eee",
                        paddingTop: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        fontSize: 12,
                        color: "#444",
                      }}
                    >
                      <strong style={{ fontSize: 12 }}>
                        Tuiles figées ({frozenTiles.length})
                      </strong>
                      <ul
                        style={{
                          listStyle: "none",
                          padding: 0,
                          margin: 0,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {frozenTiles.map((tile, index) => (
                          <li
                            key={tile.id}
                            style={{
                              border: "1px solid #e5e7eb",
                              borderRadius: 6,
                              padding: 6,
                              background: "#fafafa",
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>
                              #{index + 1} – {tile.features.length} polygone
                              {tile.features.length > 1 ? "s" : ""}
                            </div>
                            <div style={{ color: "#666" }}>
                              Centre : {tile.center[1].toFixed(4)}°,{" "}
                              {tile.center[0].toFixed(4)}°
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFrozenTile(tile.id)}
                              style={{
                                marginTop: 6,
                                padding: "4px 8px",
                                fontSize: 12,
                                borderRadius: 4,
                                border: "1px solid #d1d5db",
                                background: "#fff",
                                cursor: "pointer",
                              }}
                            >
                              Retirer cette tuile
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {/* ⛔️ retiré : contrôle sols en ligne (WMS/WFS) */}
                {/* <SoilsControl ... /> */}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bouton flottant pour ouvrir le panneau quand il est fermé */}
      {!sideOpen && !matchViewOpen && (
        <button
          onClick={() => setSideOpen(true)}
          title="Déplier le panneau latéral"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 15,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
            boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
          }}
        >
          ▶
        </button>
      )}

      {/* Barre d’outils bas */}
      {!matchViewOpen && (
        <div style={barBase}>
        <div style={toolbarScrollWrap}>
          {compact && (
            <button
              type="button"
              onClick={() => scrollToolbar(-1)}
              style={navButtonStyle}
              title="Faire défiler les actions vers la gauche"
            >
              ◀
            </button>
          )}
          <div style={toolbarScrollArea} ref={toolbarScrollRef}>
            {/* Import / Export Télépac */}
            <div style={groupStyle}>
              <ImportTelepacButton
                mapRef={mapRef}
                drawRef={drawRef}
                setFeatures={setFeatures}
                selectFeatureOnMap={selectFeatureOnMap}
                compact={compact}
                buttonStyle={btn}
                structureName={csvValues.structureName}
                onImportMeta={(meta) => {
                  if (!meta?.pacage) return;
                  setCsvValues((prev) => ({
                    ...prev,
                    codeExploitation: meta.pacage,
                  }));
                }}
              />
              <ExportMenuButton
                features={features}
                compact={compact}
                buttonStyle={{ ...btn, background: "#111", color: "#fff", border: "none" }}
                csvValues={csvValues}
                onCsvValuesChange={setCsvValues}
              />
            </div>

            {/* Dessin */}
            <div style={{ ...groupStyle, borderRight: "none" }}>
              <DrawToolbar
                mapRef={mapRef}
                drawRef={drawRef}
                features={features}
                setFeatures={setFeatures}
                selectFeatureOnMap={selectFeatureOnMap}
                onReset={handleResetParcelles}
                compact={compact}
              />
            </div>
          </div>
          {compact && (
            <button
              type="button"
              onClick={() => scrollToolbar(1)}
              style={navButtonStyle}
              title="Faire défiler les actions vers la droite"
            >
              ▶
            </button>
          )}
        </div>

        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={() => setCompact((v) => !v)}
            style={btn}
            title={compact ? "Agrandir le panneau" : "Réduire en barre d’outils"}
          >
            <IconChevron up={compact} />
            {label(compact ? "Agrandir" : "Réduire")}
          </button>
        </div>
        </div>
      )}

      <ParcelleMatchView
        open={matchViewOpen}
        features={features}
        yearOptions={yearOptions.years}
        initialYears={matchYears}
        onClose={() => setMatchViewOpen(false)}
        onValidate={handleValidateParcelleMatch}
      />
    </div>
  );
}


