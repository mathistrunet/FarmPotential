import { PARCELLES_VIEWER_FILL_ID, PARCELLES_VIEWER_LINE_ID } from "./parcellesLayers";

const buildFilterExpression = (filters) => {
  if (!filters) return null;
  const clauses = [];
  const cultureField = filters.cultureField === "precedent" ? "precedent" : "culture";
  const cultures = Array.isArray(filters.cultures)
    ? filters.cultures.map((value) => String(value).trim()).filter(Boolean)
    : [];
  if (cultures.length > 0) {
    clauses.push([
      "in",
      ["coalesce", ["get", cultureField], ""],
      ["literal", cultures],
    ]);
  }
  const precedent =
    typeof filters.precedent === "string"
      ? filters.precedent.trim()
      : filters.precedent;
  if (precedent) {
    clauses.push(["==", ["coalesce", ["get", "precedent"], ""], precedent]);
  }
  const ilot = typeof filters.ilot === "string" ? filters.ilot.trim() : filters.ilot;
  if (ilot) {
    clauses.push(["==", ["coalesce", ["get", "ilot"], ""], ilot]);
  }
  const exploitation =
    typeof filters.exploitation === "string"
      ? filters.exploitation.trim()
      : filters.exploitation;
  if (exploitation) {
    clauses.push([
      "==",
      ["to-string", ["coalesce", ["get", "exploitation"], ""]],
      String(exploitation),
    ]);
  }

  if (!clauses.length) return null;
  if (clauses.length === 1) return clauses[0];
  return ["all", ...clauses];
};

export const applyFilters = (
  map,
  filters,
  layerIds = [PARCELLES_VIEWER_FILL_ID, PARCELLES_VIEWER_LINE_ID]
) => {
  if (!map) return;
  const expression = buildFilterExpression(filters);
  layerIds.forEach((layerId) => {
    if (!map.getLayer(layerId)) return;
    map.setFilter(layerId, expression);
  });
};

export { buildFilterExpression };
