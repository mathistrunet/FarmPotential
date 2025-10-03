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
    id: "ign_plan",
    label: "IGN Plan (GeoPlateforme)",
    url: withOptionalKey("https://data.geopf.fr/tiles/PLAN.IGN/{z}/{x}/{y}.png"),
    scheme: "tms",
    tileSize: 256,
    attribution: "© IGN",
    defaultVisible: false,
    defaultOpacity: 1.0,
  },
  {
    id: "ign_satellite",
    label: "IGN Satellite",
    url: withOptionalKey(
      "https://data.geopf.fr/wmts/ORTHOIMAGERY.ORTHOPHOTOS/default/PM/{z}/{x}/{y}.jpeg",
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
    url: "https://data.geopf.fr/wmts/INRA.CARTE.SOLS/normal/default/PM/{z}/{x}/{y}.png",
    subdomains: null,
    tileSize: 256,
    attribution: "© IGN · © GisSol/INRAE",
    defaultVisible: false,
    defaultOpacity: 0.85,
  },
];
