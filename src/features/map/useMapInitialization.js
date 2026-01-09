import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import MultipleSelectionMode from "./multipleSelectionMode.js";

import { useRasterLayers } from "./useRasterLayers";
import { buildError, ERROR_CODES } from "../../utils/errors";

if (typeof window !== "undefined") window.mapboxgl = maplibregl;

const SOIL_LAYER_ID = "soil-wmts";
const SOIL_TILES =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile" +
  "&LAYER=INRA.CARTE.SOLS&STYLE=normal&FORMAT=image/png" +
  "&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}";
const SOIL_WMS =
  "https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap" +
  "&LAYERS=INRA.CARTE.SOLS&STYLES=&FORMAT=image/png&CRS=EPSG:3857" +
  "&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}";
const YEAR_COLOR_PALETTE = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#7c3aed",
  "#dc2626",
  "#0ea5e9",
  "#84cc16",
  "#facc15",
];
const DEFAULT_POLYGON_FILL = "#18A0FB";
const DEFAULT_POLYGON_LINE = "#0066CC";

const normalizeYearValue = (value) => {
  if (value == null) return null;
  const trimmed = typeof value === "string" ? value.trim() : value;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveYearColor = (year) => {
  if (!Number.isFinite(year)) return null;
  const index = Math.abs(Math.trunc(year)) % YEAR_COLOR_PALETTE.length;
  return YEAR_COLOR_PALETTE[index];
};

export function useMapInitialization() {
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const pendingFeaturesRef = useRef(null);
  const [features, setFeatures] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [mapInitError, setMapInitError] = useState(null);
  const ensureRaster = useRasterLayers();

  const syncFeaturesFromDraw = useCallback((draw) => {
    const data = draw.getAll();
    const polys = (data && data.features ? data.features : [])
      .filter(
        (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
      )
      .map((f) => ({ ...f, properties: f.properties || {} }));
    polys.forEach((feature) => {
      if (!feature.id) return;
      const currentYear = normalizeYearValue(feature.properties?.annee);
      const importYear = normalizeYearValue(feature.properties?.import_year);
      const resolvedYear = currentYear ?? importYear ?? null;
      if (currentYear == null && importYear != null) {
        draw.setFeatureProperty(feature.id, "annee", importYear);
      } else if (feature.properties?.annee !== currentYear) {
        draw.setFeatureProperty(feature.id, "annee", currentYear);
      }
      if (!feature.properties?.color) {
        const nextColor = resolveYearColor(resolvedYear);
        if (nextColor) {
          draw.setFeatureProperty(feature.id, "color", nextColor);
        }
      }
    });
    setFeatures(polys);
  }, []);

  const setDrawFeatures = useCallback(
    (collection) => {
      if (!collection) return;
      const draw = drawRef.current;
      if (!draw) {
        pendingFeaturesRef.current = collection;
        return;
      }
      draw.set(collection);
      syncFeaturesFromDraw(draw);
    },
    [syncFeaturesFromDraw]
  );

  const selectFeatureOnMap = useCallback((id, fit = false) => {
    const map = mapRef.current;
    const draw = drawRef.current;
    if (!map || !draw || !id) return;

    draw.changeMode("simple_select", { featureIds: [id] });
    setSelectedId(id);

    if (fit) {
      const all = draw.getAll();
      const found = (all && all.features ? all.features : []).find(
        (g) => g.id === id
      );
      if (found) {
        const ring = found.geometry.coordinates[0];
        const lons = ring.map((p) => p[0]);
        const lats = ring.map((p) => p[1]);
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 40, duration: 400 }
        );
      }
    }
  }, []);

  useEffect(() => {
    if (typeof maplibregl.supported === "function" && !maplibregl.supported()) {
      setMapInitError(
        buildError(
          ERROR_CODES.MAPLIBRE_UNSUPPORTED,
          "Votre navigateur ne supporte pas WebGL."
        )
      );
      return;
    }
    const style = {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {},
      layers: [
        {
          id: "bg",
          type: "background",
          paint: { "background-color": "#dde8f3" },
        },
      ],
    };

    let map;
    try {
      map = new maplibregl.Map({
        container: "map",
        style,
        center: [2.2137, 46.2276],
        zoom: 5,
      });
    } catch (error) {
      setMapInitError(
        buildError(
          ERROR_CODES.MAP_INIT_FAILED,
          "Impossible d'initialiser la carte.",
          error
        )
      );
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-left");

    let soilTilesTemplate = SOIL_TILES;
    let soilFallbackActivated = false;

    const ensureSoilLayer = (visibilityOverride) => {
      if (!map) return;

      const desiredVisibility =
        typeof visibilityOverride === "string"
          ? visibilityOverride
          : map.getLayer(SOIL_LAYER_ID)
          ? map.getLayoutProperty(SOIL_LAYER_ID, "visibility")
          : undefined;

      if (!map.getSource(SOIL_LAYER_ID)) {
        map.addSource(SOIL_LAYER_ID, {
          type: "raster",
          tiles: [soilTilesTemplate],
          tileSize: 256,
          attribution: "© IGN · © GisSol/INRAE",
        });
      }

      if (!map.getLayer(SOIL_LAYER_ID)) {
        map.addLayer({
          id: SOIL_LAYER_ID,
          type: "raster",
          source: SOIL_LAYER_ID,
          paint: { "raster-opacity": 0.85 },
        });
        map.setLayoutProperty(
          SOIL_LAYER_ID,
          "visibility",
          typeof desiredVisibility === "string" ? desiredVisibility : "none"
        );
      } else if (typeof desiredVisibility === "string") {
        map.setLayoutProperty(SOIL_LAYER_ID, "visibility", desiredVisibility);
      }
    };

    const fallbackToSoilWms = (failedUrl) => {
      if (soilFallbackActivated) return;
      soilFallbackActivated = true;
      soilTilesTemplate = SOIL_WMS;

      const currentVisibility = map.getLayer(SOIL_LAYER_ID)
        ? map.getLayoutProperty(SOIL_LAYER_ID, "visibility")
        : undefined;
      const currentOpacity = map.getLayer(SOIL_LAYER_ID)
        ? map.getPaintProperty(SOIL_LAYER_ID, "raster-opacity")
        : undefined;

      if (map.getLayer(SOIL_LAYER_ID)) {
        map.removeLayer(SOIL_LAYER_ID);
      }
      if (map.getSource(SOIL_LAYER_ID)) {
        map.removeSource(SOIL_LAYER_ID);
      }

      ensureSoilLayer(currentVisibility);
      if (typeof currentOpacity === "number") {
        map.setPaintProperty(SOIL_LAYER_ID, "raster-opacity", currentOpacity);
      }
      console.warn(
        `INRA.CARTE.SOLS WMTS tile failed (falling back to WMS). Last URL: ${failedUrl}`
      );
    };

    const hydrateRaster = () => {
      ensureRaster(map);
      ensureSoilLayer();
    };

    map.on("load", () => {
      hydrateRaster();

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {},
        defaultMode: "simple_select",

        modes: { ...MapboxDraw.modes, multiple_selection: MultipleSelectionMode },

        styles: [
          {
            id: "draw-polygon-fill-overlap-warning",
            type: "fill",
            filter: [
              "all",
              ["==", "$type", "Polygon"],
              ["==", "overlap_warning", true],
            ],
            paint: { "fill-color": "#ef4444", "fill-opacity": 0.45 },
          },
          {
            id: "draw-polygon-stroke-overlap-warning",
            type: "line",
            filter: [
              "all",
              ["==", "$type", "Polygon"],
              ["==", "overlap_warning", true],
            ],
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#b91c1c", "line-width": 3 },
          },
          {
            id: "draw-polygon-fill-inactive",
            type: "fill",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
            paint: {
              "fill-color": [
                "case",
                ["has", "color"],
                ["get", "color"],
                DEFAULT_POLYGON_FILL,
              ],
              "fill-opacity": 0.2,
            },
          },
          {
            id: "draw-polygon-fill-import-mismatch",
            type: "fill",
            filter: [
              "all",
              ["==", "$type", "Polygon"],
              ["==", "import_mismatch", true],
              ["!=", "overlap_warning", true],
            ],
            paint: { "fill-color": "#f59e0b", "fill-opacity": 0.35 },
          },
          {
            id: "draw-polygon-fill-active",
            type: "fill",
            filter: ["all", ["==", "$type", "Polygon"], ["==", "active", "true"]],
            paint: {
              "fill-color": [
                "case",
                ["has", "color"],
                ["get", "color"],
                DEFAULT_POLYGON_FILL,
              ],
              "fill-opacity": 0.3,
            },
          },
          {
            id: "draw-polygon-stroke-inactive",
            type: "line",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": [
                "case",
                ["has", "outlineColor"],
                ["get", "outlineColor"],
                ["case", ["has", "color"], ["get", "color"], DEFAULT_POLYGON_LINE],
              ],
              "line-width": 2,
            },
          },
          {
            id: "draw-polygon-stroke-import-mismatch",
            type: "line",
            filter: [
              "all",
              ["==", "$type", "Polygon"],
              ["==", "import_mismatch", true],
              ["!=", "overlap_warning", true],
            ],
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#b45309", "line-width": 3 },
          },
          {
            id: "draw-polygon-stroke-active",
            type: "line",
            filter: ["all", ["==", "$type", "Polygon"], ["==", "active", "true"]],
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": [
                "case",
                ["has", "outlineColor"],
                ["get", "outlineColor"],
                ["case", ["has", "color"], ["get", "color"], "#003366"],
              ],
              "line-width": 2,
            },
          },
          {
            id: "draw-vertex-halo-active",
            type: "circle",
            filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
            paint: { "circle-radius": 5, "circle-color": "#ffffff" },
          },
          {
            id: "draw-vertex-active",
            type: "circle",
            filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
            paint: { "circle-radius": 3, "circle-color": "#1B73E8" },
          },
        ],
      });
      drawRef.current = draw;
      map.addControl(draw, "top-left");

      const updateList = () => syncFeaturesFromDraw(draw);

      if (pendingFeaturesRef.current) {
        draw.set(pendingFeaturesRef.current);
        pendingFeaturesRef.current = null;
        syncFeaturesFromDraw(draw);
      }

      map.on("draw.selectionchange", (e) => {
        const ids = e?.features?.map((f) => f.id) || [];
        setSelectedId(ids[0] || null);
      });
      map.on("draw.create", updateList);
      map.on("draw.update", updateList);
      map.on("draw.delete", updateList);
    });

    map.on("styledata", hydrateRaster);

    map.on("error", (e) => {
      const err = e && e.error;
      const failingUrl =
        (err && (err.url || err.resource?.url || err.resource?.getURL?.())) ||
        undefined;
      const status = err && (err.status || err.statusCode);
      const message = (err && typeof err.message === "string" && err.message) || "";
      if (
        !soilFallbackActivated &&
        failingUrl &&
        failingUrl.includes("INRA.CARTE.SOLS") &&
        (status === 400 || message.includes("400"))
      ) {
        fallbackToSoilWms(failingUrl);
        return;
      }

      console.error("Map error:", err);
    });

    return () => {
      map.off("styledata", hydrateRaster);
      try {
        map.remove();
      } catch {
        // ignore
      }
    };
  }, [ensureRaster]);

  return {
    mapRef,
    drawRef,
    features,
    setFeatures,
    selectedId,
    setSelectedId,
    selectFeatureOnMap,
    setDrawFeatures,
    mapInitError,
  };
}
