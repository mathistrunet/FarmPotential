export const BDTOPO_BASE_PATH =
  "/data/BDTOPO/BDT_3-5_SHP_LAMB93_D001_ED2025-09-15";

export const BDTOPO_LAYERS = [
  {
    id: "bdtopo_cours_eau",
    label: "Cours d'eau (BD TOPO)",
    geopackage: `${BDTOPO_BASE_PATH}/cours_d_eau.gpkg`,
    defaultVisible: false,
    defaultOpacity: 1,
    infoNote:
      "Hydrographie linéaire issue de la BD TOPO. Activez le calque pour afficher les cours d'eau.",
    renderers: [
      {
        type: "line",
        paint: {
          "line-color": "#2563eb",
          "line-width": 1.4,
        },
        opacityPaintProperty: "line-opacity",
      },
    ],
  },
  {
    id: "bdtopo_troncon_hydro",
    label: "Tronçons hydrographiques",
    geopackage: `${BDTOPO_BASE_PATH}/troncon_hydrographique.gpkg`,
    defaultVisible: false,
    defaultOpacity: 1,
    infoNote:
      "Tronçons hydrographiques détaillés (cours d'eau secondaires, fossés...).",
    renderers: [
      {
        type: "line",
        paint: {
          "line-color": "#38bdf8",
          "line-width": 1.1,
        },
        opacityPaintProperty: "line-opacity",
      },
    ],
  },
  {
    id: "bdtopo_surface_hydro",
    label: "Surfaces hydrographiques",
    geopackage: `${BDTOPO_BASE_PATH}/surface_hydrographique.gpkg`,
    defaultVisible: false,
    defaultOpacity: 0.6,
    infoNote: "Plans et surfaces d'eau cartographiés par l'IGN.",
    renderers: [
      {
        id: "bdtopo_surface_hydro-fill",
        type: "fill",
        paint: {
          "fill-color": "#38bdf8",
          "fill-opacity": 0.6,
        },
        opacityPaintProperty: "fill-opacity",
      },
      {
        id: "bdtopo_surface_hydro-outline",
        type: "line",
        paint: {
          "line-color": "#0ea5e9",
          "line-width": 0.8,
          "line-opacity": 0.8,
        },
      },
    ],
  },
  {
    id: "bdtopo_plan_eau",
    label: "Plans d'eau",
    geopackage: `${BDTOPO_BASE_PATH}/plan_d_eau.gpkg`,
    defaultVisible: false,
    defaultOpacity: 0.6,
    infoNote: "Polygones des plans d'eau issus de la BD TOPO.",
    renderers: [
      {
        id: "bdtopo_plan_eau-fill",
        type: "fill",
        paint: {
          "fill-color": "#0ea5e9",
          "fill-opacity": 0.6,
        },
        opacityPaintProperty: "fill-opacity",
      },
      {
        id: "bdtopo_plan_eau-outline",
        type: "line",
        paint: {
          "line-color": "#0284c7",
          "line-width": 0.8,
          "line-opacity": 0.8,
        },
      },
    ],
  },
  {
    id: "bdtopo_bassin_versant",
    label: "Bassins versants",
    geopackage: `${BDTOPO_BASE_PATH}/bassin_versant_topographique.gpkg`,
    defaultVisible: false,
    defaultOpacity: 0.4,
    infoNote: "Contours des bassins versants topographiques.",
    renderers: [
      {
        id: "bdtopo_bassin_versant-fill",
        type: "fill",
        paint: {
          "fill-color": "#fde68a",
          "fill-opacity": 0.4,
        },
        opacityPaintProperty: "fill-opacity",
      },
      {
        id: "bdtopo_bassin_versant-outline",
        type: "line",
        paint: {
          "line-color": "#f59e0b",
          "line-width": 0.8,
          "line-opacity": 0.7,
        },
      },
    ],
  },
  {
    id: "bdtopo_detail_hydro",
    label: "Détails hydrographiques",
    geopackage: `${BDTOPO_BASE_PATH}/detail_hydrographique.gpkg`,
    defaultVisible: false,
    defaultOpacity: 1,
    infoNote: "Autres éléments hydrographiques linéaires (biefs, canaux...).",
    renderers: [
      {
        type: "line",
        paint: {
          "line-color": "#0ea5e9",
          "line-width": 0.9,
        },
        opacityPaintProperty: "line-opacity",
      },
    ],
  },
  {
    id: "bdtopo_noeud_hydro",
    label: "Nœuds hydrographiques",
    geopackage: `${BDTOPO_BASE_PATH}/noeud_hydrographique.gpkg`,
    defaultVisible: false,
    defaultOpacity: 0.8,
    infoNote: "Points caractéristiques du réseau hydrographique.",
    renderers: [
      {
        type: "circle",
        paint: {
          "circle-radius": 3,
          "circle-color": "#1d4ed8",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 0.6,
          "circle-opacity": 0.8,
        },
        opacityPaintProperty: "circle-opacity",
      },
    ],
  },
  {
    id: "bdtopo_haies",
    label: "Haies",
    geopackage: `${BDTOPO_BASE_PATH}/haie.gpkg`,
    defaultVisible: false,
    defaultOpacity: 1,
    infoNote: "Linéraires de haies cartographiés (BD TOPO).",
    renderers: [
      {
        type: "line",
        paint: {
          "line-color": "#16a34a",
          "line-width": 1,
        },
        opacityPaintProperty: "line-opacity",
      },
    ],
  },
  {
    id: "bdtopo_zone_vegetation",
    label: "Zones de végétation",
    geopackage: `${BDTOPO_BASE_PATH}/zone_de_vegetation.gpkg`,
    defaultVisible: false,
    defaultOpacity: 0.45,
    infoNote: "Polygones de zones végétalisées.",
    renderers: [
      {
        id: "bdtopo_zone_vegetation-fill",
        type: "fill",
        paint: {
          "fill-color": "#22c55e",
          "fill-opacity": 0.45,
        },
        opacityPaintProperty: "fill-opacity",
      },
      {
        id: "bdtopo_zone_vegetation-outline",
        type: "line",
        paint: {
          "line-color": "#15803d",
          "line-width": 0.6,
          "line-opacity": 0.7,
        },
      },
    ],
  },
  {
    id: "bdtopo_zone_habitation",
    label: "Zones d'habitation",
    geopackage: `${BDTOPO_BASE_PATH}/zone_d_habitation.gpkg`,
    defaultVisible: false,
    defaultOpacity: 0.4,
    infoNote: "Emprise des zones d'habitation recensées.",
    renderers: [
      {
        id: "bdtopo_zone_habitation-fill",
        type: "fill",
        paint: {
          "fill-color": "#f97316",
          "fill-opacity": 0.4,
        },
        opacityPaintProperty: "fill-opacity",
      },
      {
        id: "bdtopo_zone_habitation-outline",
        type: "line",
        paint: {
          "line-color": "#ea580c",
          "line-width": 0.8,
          "line-opacity": 0.7,
        },
      },
    ],
  },
  {
    id: "bdtopo_routes",
    label: "Réseau routier",
    geopackage: `${BDTOPO_BASE_PATH}/troncon_de_route.gpkg`,
    defaultVisible: false,
    defaultOpacity: 1,
    infoNote: "Tronçons de routes (toutes catégories).",
    renderers: [
      {
        type: "line",
        paint: {
          "line-color": "#facc15",
          "line-width": 1.2,
        },
        opacityPaintProperty: "line-opacity",
      },
    ],
  },
  {
    id: "bdtopo_foret_publique",
    label: "Forêts publiques",
    geopackage: `${BDTOPO_BASE_PATH}/foret_publique.gpkg`,
    defaultVisible: false,
    defaultOpacity: 0.4,
    infoNote: "Polygones des forêts publiques.",
    renderers: [
      {
        id: "bdtopo_foret_publique-fill",
        type: "fill",
        paint: {
          "fill-color": "#166534",
          "fill-opacity": 0.4,
        },
        opacityPaintProperty: "fill-opacity",
      },
      {
        id: "bdtopo_foret_publique-outline",
        type: "line",
        paint: {
          "line-color": "#14532d",
          "line-width": 0.8,
          "line-opacity": 0.7,
        },
      },
    ],
  },
  {
    id: "bdtopo_parcs",
    label: "Parcs ou réserves",
    geopackage: `${BDTOPO_BASE_PATH}/parc_ou_reserve.gpkg`,
    defaultVisible: false,
    defaultOpacity: 0.4,
    infoNote: "Parcs, réserves et autres zones réglementées.",
    renderers: [
      {
        id: "bdtopo_parcs-fill",
        type: "fill",
        paint: {
          "fill-color": "#0d9488",
          "fill-opacity": 0.4,
        },
        opacityPaintProperty: "fill-opacity",
      },
      {
        id: "bdtopo_parcs-outline",
        type: "line",
        paint: {
          "line-color": "#0f766e",
          "line-width": 0.8,
          "line-opacity": 0.7,
        },
      },
    ],
  },
];

export function getBdtTopoRendererLayerId(def, renderer, index) {
  if (!renderer) return `${def.id}-renderer-${index}`;
  return renderer.id || `${def.id}-${renderer.type}-${index}`;
}

export const BDTOPO_DEFAULT_STATE = BDTOPO_LAYERS.reduce((acc, def) => {
  acc[def.id] = {
    visible: def.defaultVisible ?? false,
    opacity: def.defaultOpacity ?? 1,
    loading: false,
    error: null,
    loaded: false,
  };
  return acc;
}, {});
