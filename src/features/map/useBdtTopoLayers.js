import { useCallback, useEffect, useRef, useState } from "react";
import shp from "shpjs";

import { loadGeoPackageFeatureCollection } from "../../utils/geopackage.ts";

import {
  BDTOPO_DEFAULT_STATE,
  BDTOPO_LAYERS,
} from "../../config/bdtopoLayers";

const getRendererLayerId = (def, renderer, index) =>
  renderer.id || `${def.id}-${renderer.type}-${index}`;

const waitForMapLoad = (map) => {
  if (!map) return Promise.resolve();
  if (map.isStyleLoaded()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const handle = () => {
      map.off("load", handle);
      resolve();
    };
    map.on("load", handle);
  });
};

export function useBdtTopoLayers(mapRef) {
  const [state, setState] = useState(() => ({ ...BDTOPO_DEFAULT_STATE }));
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const findDefinition = useCallback(
    (layerId) => BDTOPO_LAYERS.find((def) => def.id === layerId) || null,
    []
  );

  const ensureLayerLoaded = useCallback(
    async (def) => {
      const map = mapRef.current;
      if (!map) return;

      await waitForMapLoad(map);

      const sourceId = def.sourceId || def.id;
      const currentState = stateRef.current?.[def.id];
      if (map.getSource(sourceId) && currentState?.loaded) {
        return;
      }

      setState((prev) => ({
        ...prev,
        [def.id]: {
          ...prev[def.id],
          loading: true,
          error: null,
        },
      }));

      try {
        let geojson;
        if (def.geopackage) {
          geojson = await loadGeoPackageFeatureCollection(def.geopackage);
        } else if (def.shapefile) {
          geojson = await shp(def.shapefile);
        } else {
          throw new Error("Aucun fichier de données configuré pour cette couche BDTOPO.");
        }

        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: "geojson",
            data: geojson,
          });
        } else {
          const source = map.getSource(sourceId);
          if (source && typeof source.setData === "function") {
            source.setData(geojson);
          }
        }

        def.renderers.forEach((renderer, index) => {
          const layerId = getRendererLayerId(def, renderer, index);
          if (!map.getLayer(layerId)) {
            const layerConfig = {
              id: layerId,
              type: renderer.type,
              source: sourceId,
              paint: { ...(renderer.paint || {}) },
            };
            if (renderer.layout) {
              layerConfig.layout = { ...renderer.layout };
            }
            if (renderer.filter) {
              layerConfig.filter = renderer.filter;
            }
            if (renderer.minZoom != null) {
              layerConfig.minzoom = renderer.minZoom;
            }
            if (renderer.maxZoom != null) {
              layerConfig.maxzoom = renderer.maxZoom;
            }

            if (renderer.beforeId) {
              map.addLayer(layerConfig, renderer.beforeId);
            } else {
              map.addLayer(layerConfig);
            }
          }

          const visible =
            stateRef.current?.[def.id]?.visible ?? def.defaultVisible ?? false;
          map.setLayoutProperty(
            layerId,
            "visibility",
            visible ? "visible" : "none"
          );

          if (renderer.opacityPaintProperty) {
            const opacity =
              stateRef.current?.[def.id]?.opacity ??
              def.defaultOpacity ??
              1;
            map.setPaintProperty(layerId, renderer.opacityPaintProperty, opacity);
          }
        });

        setState((prev) => ({
          ...prev,
          [def.id]: {
            ...prev[def.id],
            loading: false,
            loaded: true,
            error: null,
          },
        }));
      } catch (error) {
        console.error(`Erreur chargement BDTOPO (${def.id})`, error);
        setState((prev) => ({
          ...prev,
          [def.id]: {
            ...prev[def.id],
            loading: false,
            error: error?.message || "Échec du chargement de la couche.",
          },
        }));
        throw error;
      }
    },
    [mapRef]
  );

  const toggleLayer = useCallback(
    async (layerId, visible) => {
      const def = findDefinition(layerId);
      if (!def) return;
      const map = mapRef.current;
      if (!map) return;

      if (visible) {
        try {
          await ensureLayerLoaded(def);
        } catch {
          // state already updated in ensureLayerLoaded
          return;
        }
      }

      def.renderers.forEach((renderer, index) => {
        const id = getRendererLayerId(def, renderer, index);
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
        }
      });

      setState((prev) => ({
        ...prev,
        [layerId]: {
          ...prev[layerId],
          visible,
        },
      }));
    },
    [ensureLayerLoaded, findDefinition, mapRef]
  );

  const setOpacity = useCallback(
    (layerId, opacity) => {
      const def = findDefinition(layerId);
      if (!def) return;
      const map = mapRef.current;
      if (!map) return;

      def.renderers.forEach((renderer, index) => {
        if (!renderer.opacityPaintProperty) return;
        const id = getRendererLayerId(def, renderer, index);
        if (map.getLayer(id)) {
          map.setPaintProperty(id, renderer.opacityPaintProperty, opacity);
        }
      });

      setState((prev) => ({
        ...prev,
        [layerId]: {
          ...prev[layerId],
          opacity,
        },
      }));
    },
    [findDefinition, mapRef]
  );

  const reloadLayer = useCallback(
    async (layerId) => {
      const def = findDefinition(layerId);
      if (!def) return;
      const map = mapRef.current;
      if (!map) return;

      await waitForMapLoad(map);

      const sourceId = def.sourceId || def.id;

      def.renderers.forEach((renderer, index) => {
        const id = getRendererLayerId(def, renderer, index);
        if (map.getLayer(id)) {
          map.removeLayer(id);
        }
      });

      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }

      setState((prev) => ({
        ...prev,
        [layerId]: {
          ...prev[layerId],
          loaded: false,
          loading: false,
        },
      }));

      try {
        await ensureLayerLoaded(def);
        const visible =
          stateRef.current?.[def.id]?.visible ?? def.defaultVisible ?? false;
        def.renderers.forEach((renderer, index) => {
          const id = getRendererLayerId(def, renderer, index);
          if (map.getLayer(id)) {
            map.setLayoutProperty(
              id,
              "visibility",
              visible ? "visible" : "none"
            );
          }
        });
      } catch {
        // error state already populated
      }
    },
    [ensureLayerLoaded, findDefinition, mapRef]
  );

  return {
    state,
    definitions: BDTOPO_LAYERS,
    toggleLayer,
    setOpacity,
    reloadLayer,
  };
}
