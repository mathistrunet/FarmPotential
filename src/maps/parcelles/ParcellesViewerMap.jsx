import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { fetchParcellesGeojson } from "../../services/parcellesBackend";
import { normalizeParcellesCollection } from "./parcellesData";
import {
  DEFAULT_PARCELLE_LINE,
  PARCELLES_VIEWER_FILL_ID,
  PARCELLES_VIEWER_LINE_ID,
  PARCELLES_VIEWER_SOURCE_ID,
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
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const hoveredIdRef = useRef(null);
  const [collection, setCollection] = useState(null);

  const resolvedCollection = useMemo(
    () => normalizeParcellesCollection(data || collection),
    [data, collection]
  );
  const latestCollectionRef = useRef(resolvedCollection);

  useEffect(() => {
    latestCollectionRef.current = resolvedCollection;
  }, [resolvedCollection]);

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
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
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
      },
      center,
      zoom,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-left");

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
            "fill-color": getFillColorExpression(colorBy, palette),
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
      ensureLayers();
      applyFilters(map, filters);
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
  }, [center, zoom]);

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
        getFillColorExpression(colorBy, palette)
      );
    }
  }, [colorBy, palette]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyFilters(map, filters);
  }, [filters]);

  return (
    <div
      ref={containerRef}
      id="parcelles-viewer-map"
      style={{ position: "absolute", inset: 0 }}
    />
  );
}
