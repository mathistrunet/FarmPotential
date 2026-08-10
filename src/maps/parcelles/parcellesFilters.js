import { PARCELLES_VIEWER_FILL_ID, PARCELLES_VIEWER_LINE_ID } from "./parcellesLayers";

const UNKNOWN_YEAR_VALUE = -999999;

function normalizeYear(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

const buildFilterExpression = (filters) => {
  if (!filters) return null;
  const clauses = [];

  const selectedYear = typeof filters.year === "string" ? filters.year.trim().toLowerCase() : filters.year;
  if (selectedYear === "unknown") {
    clauses.push([
      "==",
      ["to-number", ["coalesce", ["get", "annee"], UNKNOWN_YEAR_VALUE], UNKNOWN_YEAR_VALUE],
      UNKNOWN_YEAR_VALUE,
    ]);
  } else {
    const year = normalizeYear(selectedYear);
    if (year != null) {
      clauses.push([
        "==",
        ["to-number", ["coalesce", ["get", "annee"], UNKNOWN_YEAR_VALUE], UNKNOWN_YEAR_VALUE],
        year,
      ]);
    }
  }

  const cultures = Array.isArray(filters.cultures)
    ? filters.cultures.map((value) => String(value).trim()).filter(Boolean)
    : [];
  if (cultures.length > 0) {
    clauses.push([
      "in",
      ["coalesce", ["get", "culture"], ""],
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

/**
 * Équivalent JavaScript de l'expression MapLibre ci-dessus : permet de savoir,
 * côté application, quelles parcelles sont effectivement affichées — par
 * exemple pour recentrer la carte sur elles seules.
 */
export const matchesFilters = (feature, filters) => {
  if (!filters) return true;
  const props = feature?.properties || {};

  const selectedYear =
    typeof filters.year === "string" ? filters.year.trim().toLowerCase() : filters.year;
  const featureYear = normalizeYear(props.annee);
  if (selectedYear === "unknown") {
    if (featureYear != null) return false;
  } else {
    const year = normalizeYear(selectedYear);
    if (year != null && featureYear !== year) return false;
  }

  const cultures = Array.isArray(filters.cultures)
    ? filters.cultures.map((value) => String(value).trim()).filter(Boolean)
    : [];
  if (cultures.length > 0 && !cultures.includes(String(props.culture ?? "").trim())) {
    return false;
  }

  const precedent =
    typeof filters.precedent === "string" ? filters.precedent.trim() : filters.precedent;
  if (precedent && String(props.precedent ?? "") !== String(precedent)) return false;

  const ilot = typeof filters.ilot === "string" ? filters.ilot.trim() : filters.ilot;
  if (ilot && String(props.ilot ?? "") !== String(ilot)) return false;

  const exploitation =
    typeof filters.exploitation === "string"
      ? filters.exploitation.trim()
      : filters.exploitation;
  if (exploitation && String(props.exploitation ?? "") !== String(exploitation)) return false;

  return true;
};

export { buildFilterExpression };
