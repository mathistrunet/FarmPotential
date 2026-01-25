import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { useRasterLayers } from "../../features/map/useRasterLayers";
import { fetchParcellesGeojson } from "../../services/parcellesBackend";
import { normalizeParcellesCollection } from "./parcellesData";
import {
  DEFAULT_PARCELLE_LINE,
  PARCELLE_COLOR_ATTRIBUTE_MAP,
  PARCELLES_VIEWER_FILL_ID,
  PARCELLES_VIEWER_LINE_ID,
  PARCELLES_VIEWER_SOURCE_ID,
  buildDeterministicPalette,
  getFillColorExpression,
} from "./parcellesLayers";
import { applyFilters } from "./parcellesFilters";

const DEFAULT_CENTER = [2.2137, 46.2276];
const DEFAULT_ZOOM = 5;
export default function ParcellesViewerMap({
  data,
  filters,
  colorBy = "culture",
  palette = {},
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  isActive = true,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const hoveredIdRef = useRef(null);
  const [collection, setCollection] = useState(null);
  const ensureRaster = useRasterLayers();
  const latestFiltersRef = useRef(filters);
  const latestPaletteRef = useRef(palette);
  const latestColorByRef = useRef(colorBy);

  const resolvedCollection = useMemo(
    () => normalizeParcellesCollection(data || collection),
    [data, collection]
  );
  const computedPalette = useMemo(() => {
    const attribute = PARCELLE_COLOR_ATTRIBUTE_MAP[colorBy];
    if (!attribute || attribute === "score") return {};
    const values = new Set();
    resolvedCollection?.features?.forEach((feature) => {
      const raw = feature?.properties?.[attribute];
      if (raw == null) return;
      const value = String(raw).trim();
      if (!value) return;
      values.add(value);
    });
    return buildDeterministicPalette(Array.from(values));
  }, [resolvedCollection, colorBy]);
  const resolvedPalette = useMemo(
    () => ({ ...computedPalette, ...palette }),
    [computedPalette, palette]
  );
  const latestCollectionRef = useRef(resolvedCollection);

  useEffect(() => {
    latestCollectionRef.current = resolvedCollection;
  }, [resolvedCollection]);

  useEffect(() => {
    latestFiltersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    latestPaletteRef.current = resolvedPalette;
  }, [resolvedPalette]);

  useEffect(() => {
    latestColorByRef.current = colorBy;
  }, [colorBy]);

  useEffect(() => {
    if (data) return undefined;
    const controller = new AbortController();
    fetchParcellesGeojson(controller.signal)
      .then((payload) => {
        setCollection(payload);
      })
      .catch((error) => {
        console.warn("Impossible de charger les parcelles.", error);
      });
    return () => controller.abort();
  }, [data]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const style = {
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
    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center,
      zoom,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-left");
    map.on("error", (event) => {
      // eslint-disable-next-line no-console
      console.error("MAP ERROR", event.error || event);
    });

    const ensureLayers = () => {
      if (!map.getSource(PARCELLES_VIEWER_SOURCE_ID)) {
        map.addSource(PARCELLES_VIEWER_SOURCE_ID, {
          type: "geojson",
          data: latestCollectionRef.current,
          promoteId: "id",
        });
      }

      if (!map.getLayer(PARCELLES_VIEWER_FILL_ID)) {
        map.addLayer({
          id: PARCELLES_VIEWER_FILL_ID,
          type: "fill",
          source: PARCELLES_VIEWER_SOURCE_ID,
          filter: [
            "in",
            ["geometry-type"],
            ["literal", ["Polygon", "MultiPolygon"]],
          ],
          paint: {
            "fill-color": getFillColorExpression(
              latestColorByRef.current,
              latestPaletteRef.current
            ),
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.6,
              0.35,
            ],
          },
        });
      }

      if (!map.getLayer(PARCELLES_VIEWER_LINE_ID)) {
        map.addLayer({
          id: PARCELLES_VIEWER_LINE_ID,
          type: "line",
          source: PARCELLES_VIEWER_SOURCE_ID,
          filter: [
            "in",
            ["geometry-type"],
            ["literal", ["Polygon", "MultiPolygon"]],
          ],
          paint: {
            "line-color": DEFAULT_PARCELLE_LINE,
            "line-width": 1.5,
          },
        });
      }
    };

    const onLoad = () => {
      ensureRaster(map);
      ensureLayers();
      applyFilters(map, latestFiltersRef.current);
      requestAnimationFrame(() => map.resize());
    };

    if (map.isStyleLoaded()) {
      onLoad();
    } else {
      map.once("load", onLoad);
    }

    const handleMove = (event) => {
      const feature = event.features && event.features[0];
      if (!feature) return;
      const id = feature.id;
      if (id == null) return;
      if (hoveredIdRef.current && hoveredIdRef.current !== id) {
        map.setFeatureState(
          { source: PARCELLES_VIEWER_SOURCE_ID, id: hoveredIdRef.current },
          { hover: false }
        );
      }
      hoveredIdRef.current = id;
      map.setFeatureState(
        { source: PARCELLES_VIEWER_SOURCE_ID, id },
        { hover: true }
      );
    };

    const handleLeave = () => {
      if (hoveredIdRef.current) {
        map.setFeatureState(
          { source: PARCELLES_VIEWER_SOURCE_ID, id: hoveredIdRef.current },
          { hover: false }
        );
      }
      hoveredIdRef.current = null;
    };

    const handleClick = (event) => {
      const feature = event.features && event.features[0];
      if (!feature) return;
      const props = feature.properties || {};
      const title = props.nom || props.nom_affiche || "Parcelle";
      const culture = props.culture ? `Culture : ${props.culture}` : null;
      const precedent = props.precedent ? `Précédent : ${props.precedent}` : null;
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

    map.on("mousemove", PARCELLES_VIEWER_FILL_ID, handleMove);
    map.on("mouseleave", PARCELLES_VIEWER_FILL_ID, handleLeave);
    map.on("click", PARCELLES_VIEWER_FILL_ID, handleClick);

    return () => {
      map.off("mousemove", PARCELLES_VIEWER_FILL_ID, handleMove);
      map.off("mouseleave", PARCELLES_VIEWER_FILL_ID, handleLeave);
      map.off("click", PARCELLES_VIEWER_FILL_ID, handleClick);
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      map.remove();
    };
  }, [center, zoom, ensureRaster]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource(PARCELLES_VIEWER_SOURCE_ID);
    if (source && typeof source.setData === "function") {
      source.setData(resolvedCollection);
    }
  }, [resolvedCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(PARCELLES_VIEWER_FILL_ID)) {
      map.setPaintProperty(
        PARCELLES_VIEWER_FILL_ID,
        "fill-color",
        getFillColorExpression(colorBy, resolvedPalette)
      );
    }
  }, [colorBy, resolvedPalette]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyFilters(map, filters);
  }, [filters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isActive) return;
    requestAnimationFrame(() => map.resize());
  }, [isActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const handleResize = () => map.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isLoading = !data && collection === null;
  const hasFeatures = resolvedCollection?.features?.length > 0;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        ref={containerRef}
        id="parcelles-viewer-map"
        style={{ position: "absolute", inset: 0 }}
      />
      {!isLoading && !hasFeatures ? (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            background: "rgba(15, 23, 42, 0.85)",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          Aucune parcelle chargée.
        </div>
      ) : null}
    </div>
  );
}
