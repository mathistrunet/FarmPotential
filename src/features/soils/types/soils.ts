export interface SoilAttributes {
  [key: string]: unknown;
}

export interface SoilInfo {
  title: string;
  attributes: SoilAttributes;
  geometry?: GeoJSON.Geometry;
}

export interface SoilsLayerConfig {
  id: string;
  label: string;
  mode: "wms" | "wfs";
  wms?: { url: string; layer: string; infoFormat: string; version?: string };
  wfs?: { url: string; typeName: string };
  fields: { title: string; attributes: string[] };
  rasterOpacity: number;
  attribution: { text: string; url: string };
}
