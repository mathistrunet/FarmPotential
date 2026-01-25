// src/App.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

import RasterToggles from "./components/RasterToggles";
import ParcelleEditor from "./components/ParcelleEditor";
import { useMapInitialization } from "./features/map/useMapInitialization";
import { DEFAULT_FILL_OPACITY } from "./config/soilsLocalConfig";
import { GEO_PORTAIL_SOIL_DEFAULT_OPACITY } from "./config/soilGeoportal";
import { RASTER_LAYERS, DEFAULT_FEATURE_INFO_PARSER } from "./config/rasterLayers";

// ⛔️ retirés car liés aux calques/queries en ligne (Géoportail)
// import SoilsControl from "./features/soils/components/SoilsControl";
// import { useSoilsLayer } from "./features/soils/hooks/useSoilsLayer";
import MapInfoPanel from "./components/MapInfoPanel";
// import { getRrpAtPoint } from "./utils/rrpGetFeatureInfo";

// ✅ composant RPG autonome (chemin conservé)
import RpgFeature from "./Front/useRpgLayer";
// ✅ composant Dessin autonome (chemin conservé)
import DrawToolbar from "./Front/DrawToolbar";
// ✅ Import/Export Télépac (chemin conservé)
import ImportTelepacButton from "./Front/TelepacButton";
import ExportMenuButton from "./Front/ExportMenuButton";
import ParcelleMatchView from "./components/ParcelleMatchView";

// ✅ NOUVEAU : hook d’affichage RRP local (depuis un fichier MBTiles placé dans /public/data)
import { useSoilLayerLocal } from "./features/useSoilLayerLocal";
import { useToponymieAutoNaming } from "./features/useToponymieAutoNaming";
import { withBasePath } from "./utils/publicBase";
import { ERROR_CODES } from "./utils/errors";
import { clearParcellesGeojson, saveParcellesGeojson } from "./services/parcellesBackend";

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

const normalizeYearValue = (value) => {
  if (value == null) return null;
  const trimmed = typeof value === "string" ? value.trim() : value;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};
const DRAW_LAYER_VARIANTS = ["", ".cold", ".hot"];

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

export default function App() {
  const {
    mapRef,
    drawRef,
    features,
    setFeatures,
    selectedId,
    selectFeatureOnMap,
    setDrawFeatures,
    mapInitError,
  } = useMapInitialization();

  useToponymieAutoNaming(features, setFeatures);

  // Onglets + panneau latéral repliable
  const [sideOpen, setSideOpen] = useState(true);          // panneau latéral ouvert/fermé
  const [sideExpanded, setSideExpanded] = useState(false); // largeur étendue pour le tableau
  const [activeTab, setActiveTab] = useState("parcelles"); // "parcelles" | "calques"
  const [parcelleViewMode, setParcelleViewMode] = useState("cards"); // "cards" | "table"
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
  const [debugView, setDebugView] = useState(false);
  const [matchViewOpen, setMatchViewOpen] = useState(false);
  const [matchYears, setMatchYears] = useState({ left: null, right: null });
  const [validatedMatches, setValidatedMatches] = useState([]);
  const [validatedMatchesAt, setValidatedMatchesAt] = useState(null);
  const drawLayerFiltersRef = useRef(new Map());
  const toolbarScrollRef = useRef(null);
  const [backendReady, setBackendReady] = useState(false);
  const lastSavedPayloadRef = useRef("");
  const emptyParcellesCollection = useMemo(
    () => ({ type: "FeatureCollection", features: [] }),
    []
  );

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
    const draw = drawRef.current;
    if (!draw) return;
    draw.changeMode(debugView ? "static" : "simple_select");
  }, [debugView, features.length]);

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
        map.setFilter(layerId, nextFilter);
      });
    };

    applyFilter();
    map.on("idle", applyFilter);
    return () => {
      map.off("idle", applyFilter);
    };
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
        message: "codebook.js est absent ou invalide (labels cultures indisponibles).",
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
    const controller = new AbortController();
    clearParcellesGeojson(controller.signal)
      .then((collection) => {
        setDrawFeatures(collection);
        setBackendReady(true);
        lastSavedPayloadRef.current = JSON.stringify(collection);
      })
      .catch((error) => {
        console.warn(
          "Impossible de réinitialiser les parcelles dans le backend.",
          error
        );
        setDrawFeatures(emptyParcellesCollection);
        setBackendReady(true);
        lastSavedPayloadRef.current = JSON.stringify(emptyParcellesCollection);
      });

    return () => controller.abort();
  }, [clearParcellesGeojson, emptyParcellesCollection, setDrawFeatures]);

  const handleResetParcelles = useCallback(async () => {
    setDrawFeatures(emptyParcellesCollection);
    lastSavedPayloadRef.current = JSON.stringify(emptyParcellesCollection);
    try {
      await clearParcellesGeojson();
    } catch (error) {
      console.warn(
        "Impossible de réinitialiser les parcelles dans le backend.",
        error
      );
    }
  }, [clearParcellesGeojson, emptyParcellesCollection, setDrawFeatures]);

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
          console.warn("Impossible d'enregistrer les parcelles.", error);
        });
    }, 500);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [backendReady, features]);

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

  useEffect(() => () => {
    infoAbortControllers.current.forEach((controller) => controller.abort());
    infoAbortControllers.current = [];
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

  const handleValidateParcelleMatch = (rows) => {
    setValidatedMatches(rows);
    setValidatedMatchesAt(new Date());
    setMatchViewOpen(false);
  };

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
              <button
                type="button"
                onClick={() => setSideExpanded((v) => !v)}
                style={{
                  marginLeft: "auto",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: sideExpanded ? "#eef2ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  display: parcelleViewMode === "table" ? "inline-flex" : "none",
                }}
              >
                {sideExpanded ? "Réduire" : "Agrandir"}
              </button>
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
                Affichage par année
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <select
                  value={parcelleYearFilter}
                  onChange={(e) => setParcelleYearFilter(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                  }}
                >
                  <option value="all">Toutes les années</option>
                  {yearOptions.years.map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  ))}
                  {yearOptions.hasUnknown && (
                    <option value="unknown">Sans année</option>
                  )}
                </select>
                <select
                  value={parcelleGroupFilter}
                  onChange={(e) => setParcelleGroupFilter(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                  }}
                >
                  <option value="all">Tous les groupes</option>
                  {groupOptions.groups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                  {groupOptions.hasUngrouped && (
                    <option value="ungrouped">Sans groupe</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={handleOpenParcelleMatch}
                  disabled={yearOptions.years.length < 2}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: yearOptions.years.length < 2 ? "#f3f4f6" : "#fff",
                    cursor:
                      yearOptions.years.length < 2 ? "not-allowed" : "pointer",
                  }}
                >
                  Comparer les parcelles
                </button>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginLeft: "auto",
                    fontSize: 12,
                    color: "#444",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={debugView}
                    onChange={(e) => setDebugView(e.target.checked)}
                  />
                  Mode débug (lecture seule)
                </label>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#666" }}>
                Le mode débug affiche les parcelles sur la carte sans édition :
                filtres et couleurs restent disponibles, mais les polygones ne
                sont plus modifiables.
              </p>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#666" }}>
                Ouvre une vue dédiée pour comparer deux années côte à côte et
                valider les correspondances proposées.
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
              selectedId={selectedId}
              onSelect={(id) => selectFeatureOnMap(id, true)}
              drawRef={drawRef}
              viewMode={parcelleViewMode}
              csvValues={csvValues}
              onCsvValuesChange={setCsvValues}
              readOnly={debugView}
            />

            <p style={{ fontSize: 12, color: "#777", marginTop: 10 }}>
              Astuce : clique une fiche pour surligner la parcelle sur la carte
              (et inversement).
            </p>
          </>
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
              {debugView ? (
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px dashed #d1d5db",
                    color: "#6b7280",
                    fontSize: 12,
                    background: "#f9fafb",
                  }}
                >
                  Mode débug activé : édition des polygones désactivée.
                </div>
              ) : (
                <DrawToolbar
                  mapRef={mapRef}
                  drawRef={drawRef}
                  features={features}
                  setFeatures={setFeatures}
                  selectFeatureOnMap={selectFeatureOnMap}
                  onReset={handleResetParcelles}
                  compact={compact}
                />
              )}
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
