import centroid from "@turf/centroid";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

const flattenRings = (geometry) => {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates || [];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates || []).flat();
  return [];
};

const bboxCenter = (geometry) => {
  const rings = flattenRings(geometry);
  const coords = rings.flat();
  if (!coords.length) return { lat: 0, lon: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  coords.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  return { lon: (minX + maxX) / 2, lat: (minY + maxY) / 2 };
};

export function resolveParcelPoint(feature, strategy = "centroid") {
  const geometry = feature?.geometry;
  if (!geometry) {
    return { lat: 0, lon: 0, pointStrategy: strategy, warning: "invalid_geometry" };
  }

  const center = centroid(feature).geometry.coordinates;
  const centroidPoint = { type: "Feature", geometry: { type: "Point", coordinates: center }, properties: {} };

  if (strategy === "centroid" && booleanPointInPolygon(centroidPoint, feature)) {
    return { lat: center[1], lon: center[0], pointStrategy: "centroid", warning: null };
  }

  const box = bboxCenter(geometry);
  const boxPoint = { type: "Feature", geometry: { type: "Point", coordinates: [box.lon, box.lat] }, properties: {} };
  if (booleanPointInPolygon(boxPoint, feature)) {
    return { lat: box.lat, lon: box.lon, pointStrategy: "inside_point", warning: strategy === "centroid" ? "centroid_outside_polygon" : null };
  }

  return {
    lat: box.lat,
    lon: box.lon,
    pointStrategy: "inside_point",
    warning: "fallback_bbox_center",
  };
}
