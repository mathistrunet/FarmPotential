import type { GeoJsonProperties } from "geojson";

import { applyGerNomColor } from "../config/soilColorbook";
import type { LngLatBBox } from "../types/geo";
import { buildError, ERROR_CODES } from "../utils/errors";

export type DepartmentFeatures = {
  code: string;
  features: GeoJSON.Feature[];
};

export async function loadDepartmentGeoJSON(
  code: string,
  bounds: LngLatBBox,
  signal?: AbortSignal
): Promise<DepartmentFeatures> {
  const normalized = code.trim().toUpperCase();
  const bbox = bounds.join(",");
  const url = `/api/soil/department?code=${encodeURIComponent(normalized)}&bbox=${encodeURIComponent(bbox)}&limit=10000`;

  let payload;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    payload = await response.json();
  } catch (error) {
    throw buildError(
      ERROR_CODES.SOIL_DATA_LOAD_FAILED,
      `Echec du chargement des donnees sols (${normalized}).`,
      error
    );
  }

  const features = (payload?.collection?.features || []).map((feature) => {
    const props = { ...(feature?.properties ?? {}) } as GeoJsonProperties;
    applyGerNomColor(props);
    return {
      ...feature,
      properties: props,
    } as GeoJSON.Feature;
  });

  return { code: normalized, features };
}
