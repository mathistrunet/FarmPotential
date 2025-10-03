
// Clé d'accès GeoPlateforme : on utilise la clé publique "essentiels" par
// défaut, mais elle peut être surchargée via VITE_GEO_PORTAIL_API_KEY.

const GEO_PORTAIL_KEY = import.meta.env.VITE_GEO_PORTAIL_API_KEY || "essentiels";
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
    url: `https://data.geopf.fr/tiles/PLAN.IGN/{z}/{x}/{y}.png?apikey=${GEO_PORTAIL_KEY}`,
    scheme: "tms",
    tileSize: 256,
    attribution: "© IGN",
    defaultVisible: false,
    defaultOpacity: 1.0,
  },
  {
    id: "ign_satellite",
    label: "IGN Satellite",
    url: `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}&FORMAT=image/jpeg&apikey=${GEO_PORTAIL_KEY}`,
    subdomains: null,
    tileSize: 256,
    attribution: "© IGN",
    defaultVisible: false,
    defaultOpacity: 1.0,
  },
  {
    id: "ign_soilmap",
    label: "Carte des sols (Géoportail)",
    url: `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${GEO_PORTAIL_SOIL_LAYER}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}&FORMAT=image/png&apikey=${GEO_PORTAIL_KEY}`,
    subdomains: null,
    tileSize: 256,
    attribution: "© IGN / Géoportail",
    defaultVisible: false,
    defaultOpacity: 0.8,
  },
];
