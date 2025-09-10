import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { useRasterLayers } from "./useRasterLayers";

if (typeof window !== "undefined") window.mapboxgl = maplibregl;

export function useMapInitialization() {
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const [features, setFeatures] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const ensureRaster = useRasterLayers();

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
    const style = {
      version: 8,
      sources: {},
      layers: [
        {
          id: "bg",
          type: "background",
          paint: { "background-color": "#dde8f3" },
        },
      ],
    };

    const map = new maplibregl.Map({
      container: "map",
      style,
      center: [2.2137, 46.2276],
      zoom: 5,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-left");

    map.on("load", () => {
      ensureRaster(map);

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {},
        defaultMode: "simple_select",
        styles: [
          {
            id: "draw-polygon-fill-inactive",
            type: "fill",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
            paint: { "fill-color": "#18A0FB", "fill-opacity": 0.2 },
          },
          {
            id: "draw-polygon-fill-active",
            type: "fill",
            filter: ["all", ["==", "$type", "Polygon"], ["==", "active", "true"]],
            paint: { "fill-color": "#18A0FB", "fill-opacity": 0.3 },
          },
          {
            id: "draw-polygon-stroke-inactive",
            type: "line",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#0066CC", "line-width": 2 },
          },
          {
            id: "draw-polygon-stroke-active",
            type: "line",
            filter: ["all", ["==", "$type", "Polygon"], ["==", "active", "true"]],
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#003366", "line-width": 2 },
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

      const updateList = () => {
        const data = draw.getAll();
        const polys = (data && data.features ? data.features : [])
          .filter((f) => f.geometry?.type === "Polygon")
          .map((f) => ({ ...f, properties: f.properties || {} }));
        setFeatures(polys);
      };

      map.on("draw.selectionchange", (e) => {
        const ids = e?.features?.map((f) => f.id) || [];
        setSelectedId(ids[0] || null);
      });
      map.on("draw.create", updateList);
      map.on("draw.update", updateList);
      map.on("draw.delete", updateList);
    });

    map.on("error", (e) => console.error("Map error:", e && e.error));

    return () => {
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
  };
}
