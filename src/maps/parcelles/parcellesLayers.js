export const PARCELLES_VIEWER_SOURCE_ID = "parcelles-viewer";
export const PARCELLES_VIEWER_FILL_ID = "parcelles-viewer-fill";
export const PARCELLES_VIEWER_LINE_ID = "parcelles-viewer-line";

export const DEFAULT_PARCELLE_FILL = "#60a5fa";
export const DEFAULT_PARCELLE_LINE = "#1e3a8a";

const MODE_ATTRIBUTE_MAP = {
  culture: "culture",
  precedent: "precedent",
  ilot: "ilot",
  score: "score",
};

export const getFillColorExpression = (modeColorBy, palette = {}) => {
  const attribute = MODE_ATTRIBUTE_MAP[modeColorBy] || "culture";
  if (attribute === "score") {
    return [
      "interpolate",
      ["linear"],
      ["to-number", ["get", "score"], 0],
      0,
      "#dbeafe",
      50,
      "#60a5fa",
      80,
      "#1d4ed8",
    ];
  }

  const entries = Object.entries(palette).flatMap(([key, value]) => [key, value]);
  if (!entries.length) {
    return ["case", ["has", attribute], DEFAULT_PARCELLE_FILL, DEFAULT_PARCELLE_FILL];
  }

  return ["match", ["get", attribute], ...entries, DEFAULT_PARCELLE_FILL];
};
