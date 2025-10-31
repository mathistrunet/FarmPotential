import type { GeoJsonProperties } from "geojson";

import { applyGerNomColor } from "../config/soilColorbook";
import { loadGeoPackageFeatureCollection } from "../utils/geopackage.ts";

export type DepartmentFeatures = {
  code: string;
  features: GeoJSON.Feature[];
};

export async function loadDepartmentGeoJSON(
  code: string,
  basePath: string
): Promise<DepartmentFeatures> {
  const gpkgUrl = `${basePath}/code_insee_${code}.gpkg`;
  const collection = await loadGeoPackageFeatureCollection(gpkgUrl);

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
