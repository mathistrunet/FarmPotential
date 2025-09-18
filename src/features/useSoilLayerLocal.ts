import { useEffect, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";

// ⬇️ imports RELATIFS (plus d'alias "@")
import { loadLocalRrpMbtiles, type LngLatBBox } from "../services/rrpLocal";
import bboxClip from "@turf/bbox-clip";

import {
  FIELD_UCS,
  FIELD_LIB,
  DEFAULT_FILL,
  DEFAULT_OUTLINE,
  DEFAULT_FILL_OPACITY,
} from "../config/soilsLocalConfig";
import { loadRrpColors } from "../lib/rrpLookup";

const WEB_MERCATOR_WORLD_WIDTH_METERS = 40075016.68557849;
const MAX_TILE_EDGE_METERS = 30_000;
const HALF_SQUARE_EDGE_METERS = MAX_TILE_EDGE_METERS / 2;
const EARTH_RADIUS = WEB_MERCATOR_WORLD_WIDTH_METERS / (2 * Math.PI);
const MAX_MERCATOR_LAT = 85.05112877980659;
const MIN_TILE_ZOOM = Math.ceil(
  Math.log2(WEB_MERCATOR_WORLD_WIDTH_METERS / MAX_TILE_EDGE_METERS)
);

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

        const canRenderLabels = Boolean(map.getStyle()?.glyphs);
        if (canRenderLabels) {
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
        } else {
          console.warn(
            `Skipping "${labelLayerId}" labels because the current style has no glyphs URL.`
          );
        }

        update = () => {
          if (aborted || freezeRef.current) return;
          setLoadingTiles(true);
          const rawZoom = Math.floor(map.getZoom());
          const minAllowed = Math.max(
            MIN_TILE_ZOOM,
            reader.meta.minzoom != null ? Math.floor(reader.meta.minzoom) : MIN_TILE_ZOOM
          );
          const maxAllowed = reader.meta.maxzoom != null ? Math.floor(reader.meta.maxzoom) : rawZoom;
          const safeMax = Math.max(minAllowed, maxAllowed);
          const z = Math.min(Math.max(rawZoom, minAllowed), safeMax);
          const center = map.getCenter();
          const squareBounds = getSquareBounds(center.lng, center.lat);
          const tileRange = getTileRange(squareBounds, z);
          const all: GeoJSON.Feature[] = [];

          for (let tx = tileRange.minX; tx <= tileRange.maxX; tx++) {
            for (let ty = tileRange.minY; ty <= tileRange.maxY; ty++) {
              const normX = normalizeTileX(tx, z);
              const clampY = clampTileY(ty, z);
              const key = `${z}/${normX}/${clampY}`;
              let feats = tileCache.get(key);
              if (!feats) {
                let fc: GeoJSON.FeatureCollection | null = null;
                try {
                  fc = reader.getTileGeoJSON(z, normX, clampY);
                } catch {
                  /* ignore tile parsing errors */
                }
                feats = fc ? fc.features : [];
                tileCache.set(key, feats);
              }
              if (feats && feats.length) {
                for (const feat of feats) {
                  all.push(feat);
                }
              }
            }
          }

          const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
          if (!source) {
            if (!aborted) setLoadingTiles(false);
            return;
          }

          const clipped = clipFeaturesToBounds(all, squareBounds);

          try {
            source.setData({
              type: "FeatureCollection",
              features: clipped,
            });
            setPolygonsShown(clipped.length > 0);
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

function clipFeaturesToBounds(
  features: GeoJSON.Feature[],
  bounds: LngLatBBox
): GeoJSON.Feature[] {
  if (!features.length) return [];
  const clipped: GeoJSON.Feature[] = [];
  features.forEach((feature) => {
    if (!feature.geometry) return;
    if (
      feature.geometry.type !== "Polygon" &&
      feature.geometry.type !== "MultiPolygon"
    ) {
      return;
    }
    let clippedFeature: GeoJSON.Feature | null = null;
    try {
      clippedFeature = bboxClip(feature as GeoJSON.Feature, bounds) as GeoJSON.Feature;
    } catch {
      clippedFeature = null;
    }
    if (!clippedFeature?.geometry || geometryIsEmpty(clippedFeature.geometry)) return;
    clipped.push(cloneFeatureWithGeometry(feature, clippedFeature.geometry));
  });
  return clipped;
}

function getSquareBounds(lng: number, lat: number): LngLatBBox {
  const center = projectToMercator(lng, lat);
  const minX = center.x - HALF_SQUARE_EDGE_METERS;
  const maxX = center.x + HALF_SQUARE_EDGE_METERS;
  const minY = center.y - HALF_SQUARE_EDGE_METERS;
  const maxY = center.y + HALF_SQUARE_EDGE_METERS;
  const sw = mercatorToLngLat(minX, minY);
  const ne = mercatorToLngLat(maxX, maxY);
  return [sw.lng, sw.lat, ne.lng, ne.lat];
}

function getTileRange(bounds: LngLatBBox, z: number) {
  const [west, south, east, north] = bounds;
  const nw = lonLatToTileCoords(west, north, z);
  const se = lonLatToTileCoords(east, south, z);
  const minX = Math.floor(Math.min(nw.x, se.x));
  const maxX = Math.max(minX, Math.ceil(Math.max(nw.x, se.x)) - 1);
  const minY = Math.floor(Math.min(nw.y, se.y));
  const maxY = Math.max(minY, Math.ceil(Math.max(nw.y, se.y)) - 1);
  return { minX, maxX, minY, maxY };
}

function lonLatToTileCoords(lng: number, lat: number, z: number): { x: number; y: number } {
  const scale = 1 << z;
  const clampedLat = clampLatitude(lat);
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const y = ((1 - Math.log((1 + sinLat) / (1 - sinLat)) / Math.PI) / 2) * scale;
  return { x, y };
}

function normalizeTileX(x: number, z: number): number {
  const scale = 1 << z;
  const maxIndex = scale;
  const wrapped = ((x % maxIndex) + maxIndex) % maxIndex;
  return wrapped;
}

function clampTileY(y: number, z: number): number {
  const maxIndex = (1 << z) - 1;
  return Math.min(Math.max(y, 0), maxIndex);
}

function projectToMercator(lng: number, lat: number) {
  const clampedLat = clampLatitude(lat);
  const lambda = (lng * Math.PI) / 180;
  const phi = (clampedLat * Math.PI) / 180;
  const x = EARTH_RADIUS * lambda;
  const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2));
  return { x, y };
}

function mercatorToLngLat(x: number, y: number) {
  const lng = (x / EARTH_RADIUS) * (180 / Math.PI);
  const lat = (Math.atan(Math.sinh(y / EARTH_RADIUS)) * 180) / Math.PI;
  return { lng, lat };
}

function clampLatitude(lat: number) {
  return Math.max(Math.min(lat, MAX_MERCATOR_LAT), -MAX_MERCATOR_LAT);
}

function geometryIsEmpty(geometry: GeoJSON.Geometry): boolean {
  switch (geometry.type) {
    case "Polygon": {
      const rings = geometry.coordinates;
      if (!Array.isArray(rings) || rings.length === 0) return true;
      let hasValidRing = false;
      for (const ring of rings) {
        if (!isValidLinearRing(ring)) {
          return true;
        }
        hasValidRing = true;
      }
      return !hasValidRing;
    }
    case "MultiPolygon": {
      const polygons = geometry.coordinates;
      if (!Array.isArray(polygons) || polygons.length === 0) return true;
      let hasValidPolygon = false;
      for (const polygon of polygons) {
        if (!Array.isArray(polygon) || polygon.length === 0) {
          return true;
        }
        for (const ring of polygon) {
          if (!isValidLinearRing(ring)) {
            return true;
          }
        }
        hasValidPolygon = true;
      }
      return !hasValidPolygon;
    }
    case "LineString": {
      return !isValidLineString(geometry.coordinates);
    }
    case "MultiLineString": {
      const lines = geometry.coordinates;
      if (!Array.isArray(lines) || lines.length === 0) return true;
      let hasValidLine = false;
      for (const line of lines) {
        if (!isValidLineString(line)) {
          return true;
        }
        hasValidLine = true;
      }
      return !hasValidLine;
    }
    case "Point":
      return !isValidPosition(geometry.coordinates);
    case "MultiPoint": {
      const points = geometry.coordinates;
      if (!Array.isArray(points) || points.length === 0) return true;
      for (const point of points) {
        if (!isValidPosition(point)) {
          return true;
        }
      }
      return false;
    }
    case "GeometryCollection": {
      const geometries = geometry.geometries;
      if (!Array.isArray(geometries) || geometries.length === 0) return true;
      let hasRenderable = false;
      for (const geom of geometries) {
        if (!geom || typeof geom !== "object") {
          return true;
        }
        if (!geometryIsEmpty(geom)) {
          hasRenderable = true;
        }
      }
      return !hasRenderable;
    }
    default:
      return false;
  }
}

function isValidLineString(line: unknown): line is GeoJSON.Position[] {
  if (!Array.isArray(line) || line.length < 2) return false;
  return line.every((position) => isValidPosition(position));
}

function isValidLinearRing(ring: unknown): ring is GeoJSON.Position[] {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  if (!ring.every((position) => isValidPosition(position))) return false;
  return true;
}

function isValidPosition(position: unknown): position is GeoJSON.Position {
  if (!Array.isArray(position) || position.length < 2) return false;
  const [lng, lat, ...rest] = position;
  if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) return false;
  for (const value of rest) {
    if (value != null && !isFiniteNumber(value)) return false;
  }
  return true;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cloneFeatureWithGeometry(
  feature: GeoJSON.Feature,
  geometry: GeoJSON.Geometry
): GeoJSON.Feature {
  const { geometry: _oldGeometry, bbox: _oldBBox, ...rest } = feature as GeoJSON.Feature & {
    bbox?: GeoJSON.BBox;
  };
  return { ...rest, geometry };
}

function getLayerIdBelow(map: maplibregl.Map, zIndex: number): string | null {
  const layers = map.getStyle()?.layers ?? [];
  if (!layers.length) return null;
  const idx = Math.min(zIndex, layers.length - 1);
  return layers[idx]?.id ?? null;
}
