// Clé d'accès GeoPlateforme facultative : plusieurs couches sont publiques,
// mais VITE_GEO_PORTAIL_API_KEY peut être défini pour accéder aux ressources
// qui le nécessitent.
const GEO_PORTAIL_KEY =
  import.meta.env.VITE_GEO_PORTAIL_API_KEY?.trim() || null;

const withOptionalKey = (baseUrl) => {
  if (!GEO_PORTAIL_KEY) {
    return baseUrl;
  }
  const [url, hash] = baseUrl.split("#");
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}apikey=${encodeURIComponent(
    GEO_PORTAIL_KEY,
  )}${hash ? `#${hash}` : ""}`;
};
const GEO_PORTAIL_SOIL_LAYER =
  import.meta.env.VITE_GEO_PORTAIL_SOIL_LAYER || "SOL.SOL";

export const RASTER_LAYERS = [
  {
    id: "osm_std",
    label: "Fond OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    subdomains: null,
    tileSize: 256,
    attribution: "© OpenStreetMap",
    defaultVisible: true,
    defaultOpacity: 1.0,
  },
  {
    id: "opentopo",
    label: "OpenTopoMap",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c"],
    tileSize: 256,
    attribution: "© OpenTopoMap",
    defaultVisible: false,
    defaultOpacity: 0.8,
  },
  {
    id: "ign_satellite",
    label: "IGN Satellite",
    url: withOptionalKey(
      "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}&FORMAT=image/jpeg",
    ),
    subdomains: null,
    tileSize: 256,
    attribution: "© IGN",
    defaultVisible: false,
    defaultOpacity: 1.0,
  },
  {
    id: "fr_soils",
    label: "Types de sols (GisSol / INRAE)",
    url: "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=INRA.CARTE.SOLS&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}",
    subdomains: null,
    tileSize: 256,
    attribution: "© IGN · © GisSol/INRAE",
    mapLayerId: "soil-wmts",
    sourceId: "soil-wmts",
    managedExternally: true,
    defaultVisible: false,
    defaultOpacity: 0.85,
  },
];
