import {
  DEFAULT_PARCELLE_FILL,
  DEFAULT_PARCELLE_LINE,
  getFillColorExpression,
} from "./parcellesLayers";

const PARCELLE_GEOMETRY_FILTER = [
  "in",
  ["geometry-type"],
  ["literal", ["Polygon", "MultiPolygon"]],
];

const collectCoordinates = (coords, acc) => {
  if (!Array.isArray(coords)) return;
  coords.forEach((coord) => {
    if (Array.isArray(coord) && typeof coord[0] === "number") {
      acc.push(coord);
    } else {
      collectCoordinates(coord, acc);
    }
  });
};

const getGeojsonBounds = (geojson) => {
  const features = geojson?.features ?? [];
  if (!features.length) return null;
  const points = [];
  features.forEach((feature) => {
    if (!feature?.geometry?.coordinates) return;
    collectCoordinates(feature.geometry.coordinates, points);
  });
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach(([lon, lat]) => {
    minX = Math.min(minX, lon);
    minY = Math.min(minY, lat);
    maxX = Math.max(maxX, lon);
    maxY = Math.max(maxY, lat);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return [
    [minX, minY],
    [maxX, maxY],
  ];
};

export const addParcellesSourceAndLayers = (
  map,
  sourceId,
  fillLayerId,
  lineLayerId,
  geojson
) => {
  if (!map) return;
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "geojson",
      data: geojson,
      promoteId: "id",
    });
  }
  if (!map.getLayer(fillLayerId)) {
    map.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      filter: PARCELLE_GEOMETRY_FILTER,
      paint: {
        "fill-color": DEFAULT_PARCELLE_FILL,
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.6,
          0.35,
        ],
      },
    });
  }
  if (!map.getLayer(lineLayerId)) {
    map.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      filter: PARCELLE_GEOMETRY_FILTER,
      paint: {
        "line-color": DEFAULT_PARCELLE_LINE,
        "line-width": 1.5,
      },
    });
  }
};

export const setColorBy = (map, fillLayerId, colorBy, palette = {}) => {
  if (!map || !map.getLayer(fillLayerId)) return;
  if (colorBy === "fixed" && palette.fixedColor) {
    map.setPaintProperty(fillLayerId, "fill-color", palette.fixedColor);
    return;
  }
  if (!colorBy && palette.fixedColor) {
    map.setPaintProperty(fillLayerId, "fill-color", palette.fixedColor);
    return;
  }
  map.setPaintProperty(
    fillLayerId,
    "fill-color",
    getFillColorExpression(colorBy, palette)
  );
};

export const fitToGeojson = (map, geojson, options = {}) => {
  if (!map) return;
  const bounds = getGeojsonBounds(geojson);
  if (!bounds) return;
  map.fitBounds(bounds, { padding: 40, duration: 0, ...options });
};

export const updateGeojsonSource = (map, sourceId, geojson) => {
  if (!map) return;
  const source = map.getSource(sourceId);
  if (source && typeof source.setData === "function") {
    source.setData(geojson);
  }
};
