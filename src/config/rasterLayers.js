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

const makeLegendUrl = (layerName) =>
  withOptionalKey(
    `https://data.geopf.fr/wms-r?SERVICE=WMS&REQUEST=GetLegendGraphic&VERSION=1.3.0&FORMAT=image/png&LAYER=${encodeURIComponent(
      layerName,
    )}`,
  );

const getFirstNumericValue = (properties, keys) => {
  if (!properties) return null;
  for (const key of keys) {
    if (key in properties) {
      const value = Number(properties[key]);
      if (!Number.isNaN(value)) {
        return value;
      }
    }
  }
  return null;
};

const normaliseFeatureCollection = (payload) => {
  if (!payload) return { items: [], summary: null };

  if (typeof payload === "string") {
    return { items: [], summary: payload };
  }

  if (payload.text && typeof payload.text === "string") {
    return { items: [], summary: payload.text };
  }

  const featureCollection =
    payload?.type === "FeatureCollection"
      ? payload
      : payload?.FeatureCollection?.type === "FeatureCollection"
      ? payload.FeatureCollection
      : null;

  const features = Array.isArray(featureCollection?.features)
    ? featureCollection.features
    : Array.isArray(payload?.features)
    ? payload.features
    : [];

  const items = features.map((feature, index) => {
    const props = feature?.properties || {};
    const candidateTitle =
      feature?.id ||
      props.nom ||
      props.NOM ||
      props.libelle ||
      props.LIBELLE ||
      props.appellation ||
      props.APPELLATION ||
      `Entité ${index + 1}`;

    return {
      id: feature?.id ?? index,
      title: String(candidateTitle),
      properties: props,
    };
  });

  const summary =
    items.length > 0 ? `${items.length} élément${items.length > 1 ? "s" : ""}` : null;

  return { items, summary };
};

const defaultFeatureInfoParser = (payload) => normaliseFeatureCollection(payload);

const slopeFeatureInfoParser = (payload) => {
  const base = normaliseFeatureCollection(payload);
  const firstProps = base.items?.[0]?.properties || {};
  const slopeValue = getFirstNumericValue(firstProps, [
    "GRAY_INDEX",
    "GRAYINDEX",
    "SLOPE",
    "value",
    "VAL",
  ]);

  if (slopeValue != null) {
    const formatted = slopeValue.toLocaleString("fr-FR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
    return {
      ...base,
      summary: `Pente : ${formatted} %`,
      entries: [
        {
          label: "Pente",
          value: `${formatted} %`,
        },
      ],
    };
  }

  return base;
};

const altitudeFeatureInfoParser = (payload) => {
  const base = normaliseFeatureCollection(payload);
  const firstProps = base.items?.[0]?.properties || {};
  const altitudeValue = getFirstNumericValue(firstProps, [
    "GRAY_INDEX",
    "GRAYINDEX",
    "ALTITUDE",
    "value",
    "VAL",
  ]);

  if (altitudeValue != null) {
    const formatted = altitudeValue.toLocaleString("fr-FR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
    return {
      ...base,
      summary: `Altitude : ${formatted} m`,
      entries: [
        {
          label: "Altitude",
          value: `${formatted} m`,
        },
      ],
    };
  }

  return base;
};

export const DEFAULT_FEATURE_INFO_PARSER = defaultFeatureInfoParser;

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
  {
    id: "gp_hedges",
    label: "Haies (Géoportail)",
    url: withOptionalKey(
      "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=VEGETATION.HAIES&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}",
    ),
    tileSize: 256,
    attribution: "© IGN",
    defaultVisible: false,
    defaultOpacity: 1,
    legendUrl: makeLegendUrl("VEGETATION.HAIES"),
    infoNote:
      "Affiche les linéaires de haies recensés par l'IGN. Cliquer sur la carte pour obtenir les attributs à l'emplacement sélectionné.",
    featureInfo: {
      url: withOptionalKey("https://data.geopf.fr/wms-r"),
      layerName: "VEGETATION.HAIES",
      styles: "normal",
      infoFormat: "application/json",
      parser: defaultFeatureInfoParser,
    },
  },
  {
    id: "gp_trees",
    label: "Arbres isolés (Géoportail)",
    url: withOptionalKey(
      "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=VEGETATION.ARBRE_ISOLE&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}",
    ),
    tileSize: 256,
    attribution: "© IGN",
    defaultVisible: false,
    defaultOpacity: 1,
    legendUrl: makeLegendUrl("VEGETATION.ARBRE_ISOLE"),
    infoNote:
      "Affiche les arbres isolés inventoriés. Les attributs détaillés sont accessibles par clic lorsque le calque est activé.",
    featureInfo: {
      url: withOptionalKey("https://data.geopf.fr/wms-r"),
      layerName: "VEGETATION.ARBRE_ISOLE",
      styles: "normal",
      infoFormat: "application/json",
      parser: defaultFeatureInfoParser,
    },
  },
  {
    id: "gp_water",
    label: "Cours d'eau (Géoportail)",
    url: withOptionalKey(
      "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=HYDROGRAPHIE.COURS_EAU&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}",
    ),
    tileSize: 256,
    attribution: "© IGN",
    defaultVisible: false,
    defaultOpacity: 1,
    legendUrl: makeLegendUrl("HYDROGRAPHIE.COURS_EAU"),
    infoNote:
      "Visualise le réseau hydrographique principal. L'outil d'information renvoie la nature du tronçon cliqué.",
    featureInfo: {
      url: withOptionalKey("https://data.geopf.fr/wms-r"),
      layerName: "HYDROGRAPHIE.COURS_EAU",
      styles: "normal",
      infoFormat: "application/json",
      parser: defaultFeatureInfoParser,
    },
  },
  {
    id: "gp_slope",
    label: "Pente (Geoportail)",
    url: withOptionalKey(
      "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ELEVATION.SLOPE&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}",
    ),
    tileSize: 256,
    attribution: "© IGN",
    defaultVisible: false,
    defaultOpacity: 0.7,
    legendUrl: makeLegendUrl("ELEVATION.SLOPE"),
    infoNote:
      "Couche raster représentant la pente en pourcentage. Le clic renvoie la valeur calculée sur la cellule intersectée.",
    featureInfo: {
      url: withOptionalKey("https://data.geopf.fr/wms-r"),
      layerName: "ELEVATION.SLOPE",
      styles: "normal",
      infoFormat: "application/json",
      parser: slopeFeatureInfoParser,
    },
  },
  {
    id: "gp_altitude",
    label: "Altitude (Geoportail)",
    url: withOptionalKey(
      "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ELEVATION.MNT&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}",
    ),
    tileSize: 256,
    attribution: "© IGN",
    defaultVisible: false,
    defaultOpacity: 0.65,
    legendUrl: makeLegendUrl("ELEVATION.MNT"),
    infoNote:
      "Altitude issue du Modèle Numérique de Terrain. Le clic donne l'altitude estimée en mètres.",
    featureInfo: {
      url: withOptionalKey("https://data.geopf.fr/wms-r"),
      layerName: "ELEVATION.MNT",
      styles: "normal",
      infoFormat: "application/json",
      parser: altitudeFeatureInfoParser,
    },
  },
  {
    id: "gp_protected",
    label: "Zones protégées (Géoportail)",
    url: withOptionalKey(
      "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=PROTECTION.ZONES_NATURELLES&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}",
    ),
    tileSize: 256,
    attribution: "© IGN",
    defaultVisible: false,
    defaultOpacity: 0.7,
    legendUrl: makeLegendUrl("PROTECTION.ZONES_NATURELLES"),
    infoNote:
      "Regroupe les principales protections environnementales (Natura 2000, réserves, etc.). Le clic affiche les désignations concernées.",
    featureInfo: {
      url: withOptionalKey("https://data.geopf.fr/wms-r"),
      layerName: "PROTECTION.ZONES_NATURELLES",
      styles: "normal",
      infoFormat: "application/json",
      parser: defaultFeatureInfoParser,
    },
  },
];
