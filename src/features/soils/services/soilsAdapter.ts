import type { LngLatLike, Map } from "maplibre-gl";
import type { SoilInfo, SoilsLayerConfig } from "../types/soils";
import { getFeatureInfoWFS, getFeatureInfoWMS } from "./soilsService";

function toSoilInfo(feature: any, cfg: SoilsLayerConfig): SoilInfo {
  const attrs: Record<string, unknown> = {};
  cfg.fields.attributes.forEach((f) => {
    if (feature.properties && feature.properties[f] !== undefined) {
      attrs[f] = feature.properties[f];
    }
  });
  const title = feature.properties?.[cfg.fields.title] || "Sol";
  return { title, attributes: attrs, geometry: feature.geometry };
}

export async function getInfoAtPoint(map: Map, lngLat: LngLatLike, cfg: SoilsLayerConfig): Promise<SoilInfo | null> {
  if (cfg.mode === "wfs") {
    const data: any = await getFeatureInfoWFS(lngLat, cfg);
    const feature = data?.features?.[0];
    return feature ? toSoilInfo(feature, cfg) : null;
  }
  const data: any = await getFeatureInfoWMS(map, lngLat, cfg);
  const feature = data?.features?.[0];
  return feature ? toSoilInfo(feature, cfg) : null;
}

