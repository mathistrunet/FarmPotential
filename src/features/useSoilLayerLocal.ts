import { useEffect, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import bboxClip from "@turf/bbox-clip";

import type { LngLatBBox } from "../services/rrpLocal";
import { loadDepartmentGeoJSON } from "../services/soilmapLocal";
import departementsMeta from "../data/departements_meta.json";

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
const MAX_DEPARTMENTS = 3;

const META = departementsMeta as Record<
  string,
  { bbox: [number, number, number, number]; centroid: [number, number] }
>;

type Options = {
  map: maplibregl.Map | null;
  dataPath?: string;
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
  dataPath = "/data/soilmap_dep",
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
  const requestIdRef = useRef(0);
  const departmentCacheRef = useRef(new Map<string, GeoJSON.Feature[]>());
  const departmentPromiseRef = useRef(new Map<string, Promise<GeoJSON.Feature[]>>());

  useEffect(() => {
    departmentCacheRef.current.clear();
    departmentPromiseRef.current.clear();
  }, [dataPath]);

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

    const ensureDepartment = (code: string) => {
      const cacheKey = normalizeDepartmentCode(code);
      const cache = departmentCacheRef.current;
      const promises = departmentPromiseRef.current;
      if (cache.has(cacheKey)) {
        return Promise.resolve(cache.get(cacheKey)!);
      }
      let promise = promises.get(cacheKey);
      if (!promise) {
        promise = loadDepartmentGeoJSON(cacheKey, dataPath)
          .then((res) => {
            cache.set(cacheKey, res.features);
            return res.features;
          })
          .catch((err) => {
            promises.delete(cacheKey);
            throw err;
          });
        promises.set(cacheKey, promise);
      }
      return promise;
    };

    const runUpdate = async () => {
      if (aborted || freezeRef.current) return;
      const center = map.getCenter();
      const codes = pickNearestDepartments(center.lng, center.lat, MAX_DEPARTMENTS);
      if (!codes.length) {
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        source?.setData({ type: "FeatureCollection", features: [] });
        setPolygonsShown(false);
        setLoadingTiles(false);
        return;
      }
      setLoadingTiles(true);
      const reqId = ++requestIdRef.current;
      try {
        await Promise.all(codes.map((code) => ensureDepartment(code)));
        if (aborted || reqId !== requestIdRef.current) return;
        const squareBounds = getSquareBounds(center.lng, center.lat);
        const features = codes.flatMap((code) =>
          departmentCacheRef.current.get(normalizeDepartmentCode(code)) ?? []
        );
        const clipped = clipFeaturesToBounds(features, squareBounds);
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (!source) return;
        source.setData({ type: "FeatureCollection", features: clipped });
        setPolygonsShown(clipped.length > 0);
      } catch (error) {
        if (!aborted) {
          console.error("Failed to load soil department", error);
        }
      } finally {
        if (!aborted) setLoadingTiles(false);
      }
    };

    const updateHandler = () => {
      void runUpdate();
    };

    async function add() {
      try {
        if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
        if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);

        const colors = await loadRrpColors();
        if (aborted) return;

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

        updateRef.current = updateHandler;
        updateHandler();
        map.on("move", updateHandler);
        map.on("zoom", updateHandler);
      } catch (err) {
        console.error("RRP GeoPackage error:", err);
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
      map.off("move", updateHandler);
      map.off("zoom", updateHandler);
      if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
      if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
      if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      updateRef.current = null;
      requestIdRef.current += 1;
      setPolygonsShown(false);
      setLoadingTiles(false);
    };
  }, [
    map,
    visible,
    dataPath,
    sourceId,
    fillLayerId,
    lineLayerId,
    labelLayerId,
    zIndex,
    fillOpacity,
  ]);

  useEffect(() => {
    if (!map) return;
    if (map.getLayer(fillLayerId)) {
      map.setPaintProperty(fillLayerId, "fill-opacity", fillOpacity);
    }
  }, [map, fillLayerId, fillOpacity]);

  return { polygonsShown, loadingTiles };
}

function pickNearestDepartments(lng: number, lat: number, limit: number): string[] {
  const scores = Object.entries(META).map(([code, info]) => {
    const [minX, minY, maxX, maxY] = info.bbox;
    const inside = lng >= minX && lng <= maxX && lat >= minY && lat <= maxY;
    const [cx, cy] = info.centroid;
    const dx = lng - cx;
    const dy = lat - cy;
    return { code, inside, dist2: dx * dx + dy * dy };
  });

  scores.sort((a, b) => {
    if (a.inside && !b.inside) return -1;
    if (!a.inside && b.inside) return 1;
    if (a.dist2 === b.dist2) return a.code.localeCompare(b.code);
    return a.dist2 - b.dist2;
  });

  return scores.slice(0, limit).map((entry) => entry.code);
}

function normalizeDepartmentCode(code: string): string {
  return code.trim().toUpperCase();
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
      feature.geometry.type !== "MultiPolygon" &&
      feature.geometry.type !== "GeometryCollection"
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
