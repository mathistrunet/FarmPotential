import { useCallback, useEffect, useRef, useState } from "react";

import {
  BDTOPO_DEFAULT_STATE,
  BDTOPO_LAYERS,
  BDTOPO_WFS_URL,
  getBdtTopoRendererLayerId,
} from "../../config/bdtopoLayers";

const WFS_DEFAULT_VERSION = "2.0.0";
const WFS_DEFAULT_SRS = "EPSG:4326";
const WFS_DEFAULT_OUTPUT = "application/json";
const WFS_DEFAULT_COUNT = 5000;

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

const getMapBbox = (map) => {
  const bounds = typeof map.getBounds === "function" ? map.getBounds() : null;
  if (!bounds) {
    throw new Error("Impossible de récupérer l'étendue actuelle de la carte.");
  }

  const sw = typeof bounds.getSouthWest === "function" ? bounds.getSouthWest() : bounds._sw;
  const ne = typeof bounds.getNorthEast === "function" ? bounds.getNorthEast() : bounds._ne;
  if (!sw || !ne) {
    throw new Error("Bbox invalide pour la requête WFS.");
  }

  const bbox = [sw.lng, sw.lat, ne.lng, ne.lat];
  const bboxKey = bbox.map((value) => value.toFixed(5)).join(",");
  return { bbox, bboxKey };
};

const buildWfsUrl = (def, bbox, srsName) => {
  const url = new URL(def.wfsUrl || BDTOPO_WFS_URL);
  const params = url.searchParams;
  const version = def.wfsVersion || WFS_DEFAULT_VERSION;
  const outputFormat = def.wfsOutputFormat || WFS_DEFAULT_OUTPUT;
  const count = def.maxFeatures ?? WFS_DEFAULT_COUNT;

  params.set("SERVICE", "WFS");
  params.set("VERSION", version);
  params.set("REQUEST", "GetFeature");
  params.set("TYPENAMES", def.wfsLayerName);
  params.set("SRSNAME", srsName);
  params.set("BBOX", `${bbox.join(",")},${srsName}`);
  params.set("OUTPUTFORMAT", outputFormat);
  params.set("COUNT", String(count));

  if (Array.isArray(def.propertyNames) && def.propertyNames.length > 0) {
    params.set("PROPERTYNAME", def.propertyNames.join(","));
  }

  if (def.wfsExtraParams && typeof def.wfsExtraParams === "object") {
    Object.entries(def.wfsExtraParams).forEach(([key, value]) => {
      if (value != null) {
        params.set(key, String(value));
      }
    });
  }

  return url.toString();
};

export function useBdtTopoLayers(mapRef) {
  const [state, setState] = useState(() => ({ ...BDTOPO_DEFAULT_STATE }));
  const stateRef = useRef(state);
  const wfsBboxRef = useRef({});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const findDefinition = useCallback(
    (layerId) => BDTOPO_LAYERS.find((def) => def.id === layerId) || null,
    []
  );

  const fetchWfsGeojson = useCallback(
    async (def, map, { force = false } = {}) => {
      if (!def.wfsLayerName) {
        throw new Error("Couche WFS manquante pour la BD TOPO.");
      }

      const { bbox, bboxKey } = getMapBbox(map);
      if (!force && wfsBboxRef.current[def.id] === bboxKey) {
        return null;
      }

      const srsName = def.wfsSrs || WFS_DEFAULT_SRS;
      const url = buildWfsUrl(def, bbox, srsName);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`WFS HTTP ${response.status}`);
      }

      const geojson = await response.json();
      wfsBboxRef.current[def.id] = bboxKey;
      return geojson;
    },
    []
  );

  const applySourceData = useCallback((map, sourceId, geojson) => {
    if (!geojson) return;
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: geojson,
      });
      return;
    }

    const source = map.getSource(sourceId);
    if (source && typeof source.setData === "function") {
      source.setData(geojson);
    }
  }, []);

  const ensureRenderLayers = useCallback((map, def, sourceId) => {
    def.renderers.forEach((renderer, index) => {
      const layerId = getBdtTopoRendererLayerId(def, renderer, index);
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
          stateRef.current?.[def.id]?.opacity ?? def.defaultOpacity ?? 1;
        map.setPaintProperty(layerId, renderer.opacityPaintProperty, opacity);
      }
    });
  }, []);

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
        let geojson = null;
        if (def.wfsLayerName) {
          geojson = await fetchWfsGeojson(def, map, { force: true });
        } else {
          throw new Error("Aucune couche WFS configurée pour cette couche BDTOPO.");
        }

        applySourceData(map, sourceId, geojson);
        ensureRenderLayers(map, def, sourceId);

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
    [applySourceData, ensureRenderLayers, fetchWfsGeojson, mapRef]
  );

  const refreshVisibleWfsLayers = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const visibleDefs = BDTOPO_LAYERS.filter(
      (def) => def.wfsLayerName && stateRef.current?.[def.id]?.visible
    );

    await Promise.all(
      visibleDefs.map(async (def) => {
        const sourceId = def.sourceId || def.id;
        try {
          const geojson = await fetchWfsGeojson(def, map);
          if (geojson) {
            applySourceData(map, sourceId, geojson);
          }
        } catch (error) {
          console.error(`Erreur WFS BDTOPO (${def.id})`, error);
          setState((prev) => ({
            ...prev,
            [def.id]: {
              ...prev[def.id],
              error: error?.message || "Échec du rafraîchissement de la couche.",
            },
          }));
        }
      })
    );
  }, [applySourceData, fetchWfsGeojson, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const handleMoveEnd = () => {
      refreshVisibleWfsLayers();
    };

    map.on("moveend", handleMoveEnd);
    return () => {
      map.off("moveend", handleMoveEnd);
    };
  }, [mapRef, refreshVisibleWfsLayers]);

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
        const id = getBdtTopoRendererLayerId(def, renderer, index);
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
        const id = getBdtTopoRendererLayerId(def, renderer, index);
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
        const id = getBdtTopoRendererLayerId(def, renderer, index);
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
          error: null,
        },
      }));

      try {
        await ensureLayerLoaded(def);
        const visible =
          stateRef.current?.[def.id]?.visible ?? def.defaultVisible ?? false;
        def.renderers.forEach((renderer, index) => {
          const id = getBdtTopoRendererLayerId(def, renderer, index);
          if (map.getLayer(id)) {
            map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
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
