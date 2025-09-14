import type { SoilsLayerConfig } from "../types/soils";

export const SOILS_LAYERS: SoilsLayerConfig[] = [
  {
    id: "rrp",
    label: "Carte des sols France",
    mode: import.meta.env.VITE_SOILS_MODE || "wms",
    wms: {
      url: import.meta.env.VITE_SOILS_WMS_URL || "https://data.geopf.fr/wms-r/wms",
      layer: import.meta.env.VITE_SOILS_WMS_LAYER || "INRA.CARTE.SOLS",
      infoFormat: import.meta.env.VITE_SOILS_WMS_INFO_FORMAT || "application/json",
      version: import.meta.env.VITE_SOILS_WMS_VERSION || "1.3.0",
    },
    wfs: {
      url: import.meta.env.VITE_SOILS_WFS_URL || "https://example.com/soils/wfs",
      typeName: import.meta.env.VITE_SOILS_WFS_TYPENAME || "soils",
    },
    fields: {
      title: "RRP_LABEL",
      attributes: ["RRP_CODE", "RRP_LABEL", "TEXTURE"],
    },
    rasterOpacity: 0.6,
    attribution: {
      text: "IGCS/RRP",
      url: "https://www.gissol.fr/",
    },
  },
];

