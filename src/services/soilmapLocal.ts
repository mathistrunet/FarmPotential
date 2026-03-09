import type { GeoJsonProperties } from "geojson";

import { applyGerNomColor } from "../config/soilColorbook";
import { loadGeoPackageFeatureCollection } from "../utils/geopackage.ts";
import { buildError, ERROR_CODES } from "../utils/errors";

export type DepartmentFeatures = {
  code: string;
  features: GeoJSON.Feature[];
};

export async function loadDepartmentGeoJSON(
  code: string,
  basePath: string
): Promise<DepartmentFeatures> {
  const gpkgUrl = `${basePath}/code_insee_${code}.gpkg`;
  let collection;
  try {
    collection = await loadGeoPackageFeatureCollection(gpkgUrl);
  } catch (error) {
    throw buildError(
      ERROR_CODES.SOIL_DATA_LOAD_FAILED,
      `Échec du chargement des données sols (${code}).`,
      error
    );
  }

  const features = collection.features.map((feature) => {
    const props = { ...(feature.properties ?? {}) } as GeoJsonProperties;
    applyGerNomColor(props);
    return {
      ...feature,
      properties: props,
    } as GeoJSON.Feature;
  });

  return { code, features };
}
