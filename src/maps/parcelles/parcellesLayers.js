import { buildStableHash } from "./parcellesData";

export const PARCELLES_VIEWER_SOURCE_ID = "parcelles-viewer";
export const PARCELLES_VIEWER_FILL_ID = "parcelles-viewer-fill";
export const PARCELLES_VIEWER_LINE_ID = "parcelles-viewer-line";

export const DEFAULT_PARCELLE_FILL = "#60a5fa";
export const DEFAULT_PARCELLE_LINE = "#1e3a8a";

export const PARCELLE_COLOR_ATTRIBUTE_MAP = {
  culture: "culture",
  precedent: "precedent",
  ilot: "ilot",
  exploitation: "exploitation",
  default: null,
  score: "score",
};

const toColorValue = (value) => {
  const hash = parseInt(buildStableHash(value).slice(0, 8), 16);
  const hue = Number.isFinite(hash) ? hash % 360 : 210;
  return `hsl(${hue} 65% 45%)`;
};

export const buildDeterministicPalette = (values = []) => {
  const palette = {};
  values.forEach((value) => {
    const key = String(value);
    if (palette[key]) return;
    palette[key] = toColorValue(key);
  });
  return palette;
};

export const getFillColorExpression = (modeColorBy, palette = {}) => {
  const attribute = PARCELLE_COLOR_ATTRIBUTE_MAP[modeColorBy] || "culture";
  if (attribute === "score") {
    return [
      "interpolate",
      ["linear"],
      ["to-number", ["coalesce", ["get", "score"], 0], 0],
      0,
      "#dbeafe",
      50,
      "#60a5fa",
      80,
      "#1d4ed8",
    ];
  }

  if (!attribute) {
    return DEFAULT_PARCELLE_FILL;
  }

  const entries = Object.entries(palette).flatMap(([key, value]) => [key, value]);
  if (!entries.length) {
    return ["case", ["has", attribute], DEFAULT_PARCELLE_FILL, DEFAULT_PARCELLE_FILL];
  }

  return [
    "match",
    ["coalesce", ["get", attribute], ""],
    ...entries,
    DEFAULT_PARCELLE_FILL,
  ];
};
