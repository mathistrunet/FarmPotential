import { PARCELLES_VIEWER_FILL_ID, PARCELLES_VIEWER_LINE_ID } from "./parcellesLayers";

const buildFilterExpression = (filters) => {
  if (!filters) return null;
  const clauses = [];
  if (filters.cultures && filters.cultures.length > 0) {
    clauses.push([
      "in",
      ["get", "culture"],
      ["literal", filters.cultures],
    ]);
  }
  if (filters.precedent) {
    clauses.push(["==", ["get", "precedent"], filters.precedent]);
  }
  if (filters.ilot) {
    clauses.push(["==", ["get", "ilot"], filters.ilot]);
  }
  if (filters.exploitationId) {
    clauses.push([
      "==",
      ["to-string", ["get", "exploitationId"]],
      String(filters.exploitationId),
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
