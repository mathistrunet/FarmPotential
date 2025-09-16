import { useEffect, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";

// ⬇️ imports RELATIFS (plus d'alias "@")
import { loadLocalRrpMbtiles, lonLatToTile } from "../services/rrpLocal";
import {
  FIELD_UCS,
  FIELD_LIB,
  DEFAULT_FILL,
  DEFAULT_OUTLINE,
  DEFAULT_FILL_OPACITY,
} from "../config/soilsLocalConfig";
import { loadRrpColors } from "../lib/rrpLookup";


type Options = {
  map: maplibregl.Map | null;
  mbtilesUrl?: string;
  sourceId?: string;
  fillLayerId?: string;
  lineLayerId?: string;
  labelLayerId?: string;
  zIndex?: number;
  visible?: boolean;
  fillOpacity?: number;
  freezeTiles?: boolean;
};

export function useSoilLayerLocal({
  map,
  mbtilesUrl = "/data/rrp_france_wgs84_shp.mbtiles",
  sourceId = "soils-rrp",
  fillLayerId = "soils-rrp-fill",
  lineLayerId = "soils-rrp-outline",
  labelLayerId = "soils-rrp-label",
  zIndex = 10,
  visible = true,
  fillOpacity = DEFAULT_FILL_OPACITY,
  freezeTiles = false,
}: Options) {
  const [polygonsShown, setPolygonsShown] = useState(false);
  const [loadingTiles, setLoadingTiles] = useState(false);
  const freezeRef = useRef(freezeTiles);
  const updateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    freezeRef.current = freezeTiles;
    if (freezeTiles) {
      setLoadingTiles(false);
    } else {
      updateRef.current?.();
    }
  }, [freezeTiles]);

  useEffect(() => {
    if (!map) return;

    if (!visible) {
      if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
      if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
      if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      setPolygonsShown(false);
      setLoadingTiles(false);
      return;
    }
    let aborted = false;
    let update: (() => void) | undefined;

    async function add() {
      try {
        if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
        if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);

        setLoadingTiles(true);
        const [reader, colors] = await Promise.all([
          loadLocalRrpMbtiles(mbtilesUrl),
          loadRrpColors(),
        ]);
        if (aborted) return;

        const tileCache = new Map<string, GeoJSON.Feature[]>();

        map.addSource(sourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          promoteId: "id",
        });

        const colorExpr: any[] = [
          "match",
          ["to-string", ["coalesce", ["get", "code_coul"], ["get", "CODE_COUL"]]],
        ];
        Object.entries(colors).forEach(([code, hex]) => {
          colorExpr.push(code, hex);
        });
        colorExpr.push(DEFAULT_FILL);

        map.addLayer(
          {
            id: fillLayerId,
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": colorExpr,
              "fill-opacity": fillOpacity,
            },
          },
          getLayerIdBelow(map, zIndex) || undefined
        );

        map.addLayer(
          {
            id: lineLayerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": DEFAULT_OUTLINE,
              "line-width": 0.6,
              "line-opacity": 0.9,
            },
          },
          getLayerIdBelow(map, zIndex + 1) || undefined
        );

        const labelExpr: any = [
          "coalesce",
          ["to-string", ["get", FIELD_UCS[0]]],
          ["to-string", ["get", FIELD_LIB[0] ?? FIELD_UCS[0]]],
        ];

        map.addLayer(
          {
            id: labelLayerId,
            type: "symbol",
            source: sourceId,
            layout: {
              "text-field": labelExpr,
              "text-size": 10,
              "text-allow-overlap": false,
            },
            paint: {
              "text-color": "#222",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.2,
            },
          },
          getLayerIdBelow(map, zIndex + 2) || undefined
        );

        update = () => {
          if (aborted || freezeRef.current) return;
          setLoadingTiles(true);
          const z = Math.floor(map.getZoom());
          const center = map.getCenter();
          const { x, y } = lonLatToTile(center.lng, center.lat, z);
          const tiles = [
            { x, y },
            { x: x + 1, y },
            { x, y: y + 1 },
            { x: x + 1, y: y + 1 },
          ];
          const all: GeoJSON.Feature[] = [];
          tiles.forEach(({ x, y }) => {
            const key = `${z}/${x}/${y}`;
            let feats = tileCache.get(key);
            if (!feats) {
              let fc: GeoJSON.FeatureCollection | null = null;
              try {
                fc = reader.getTileGeoJSON(z, x, y);
              } catch {
                /* ignore tile parsing errors */
              }
              feats = fc ? fc.features : [];
              tileCache.set(key, feats);
            }
            all.push(...feats);
          });
          const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
          if (!source) {
            if (!aborted) setLoadingTiles(false);
            return;
          }
          try {
            source.setData({
              type: "FeatureCollection",
              features: all,
            });
            setPolygonsShown(all.length > 0);
          } finally {
            if (!aborted) setLoadingTiles(false);
          }
        };

        updateRef.current = update;
        update();
        map.on("move", update);
        map.on("zoom", update);
      } catch (err) {
        console.error("RRP local error:", err);
        setLoadingTiles(false);
      }
    }

    const start = () => {
      if (aborted) return;
      add();
    };

    if (!map.isStyleLoaded()) {
      map.once("load", start);
    } else {
      start();
    }

    return () => {
      aborted = true;
      map.off("load", start);
      if (update) {
        map.off("move", update);
        map.off("zoom", update);
      }
      updateRef.current = null;
      setPolygonsShown(false);
      setLoadingTiles(false);
    };
  }, [map, visible, mbtilesUrl, sourceId, fillLayerId, lineLayerId, labelLayerId, zIndex]);

  useEffect(() => {
    if (!map) return;
    if (map.getLayer(fillLayerId)) {
      map.setPaintProperty(fillLayerId, "fill-opacity", fillOpacity);
    }
  }, [map, fillLayerId, fillOpacity]);
  return { polygonsShown, loadingTiles };
}

function getLayerIdBelow(map: maplibregl.Map, zIndex: number): string | null {
  const layers = map.getStyle()?.layers ?? [];
  if (!layers.length) return null;
  const idx = Math.min(zIndex, layers.length - 1);
  return layers[idx]?.id ?? null;
}
