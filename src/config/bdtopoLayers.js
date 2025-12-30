export const BDTOPO_WFS_URL = "https://wxs.ign.fr/bdtopo/geoportail/wfs";

export const BDTOPO_LAYERS = [
  {
    id: "bdtopo_zone_occupation_sol",
    label: "Occupation du sol (BD TOPO)",
    wfsLayerName: "BDTOPO_V3:zone_occupation_sol",
    defaultVisible: false,
    defaultOpacity: 0.45,
    infoNote: "Occupation du sol issue de la BD TOPO (WFS IGN).",
    renderers: [
      {
        id: "bdtopo_zone_occupation_sol-fill",
        type: "fill",
        paint: {
          "fill-color": "#a3e635",
          "fill-opacity": 0.45,
        },
        opacityPaintProperty: "fill-opacity",
      },
      {
        id: "bdtopo_zone_occupation_sol-outline",
        type: "line",
        paint: {
          "line-color": "#4d7c0f",
          "line-width": 0.6,
          "line-opacity": 0.6,
        },
      },
    ],
  },
  {
    id: "bdtopo_zone_vegetation",
    label: "Zones de végétation",
    wfsLayerName: "BDTOPO_V3:zone_vegetation",
    defaultVisible: false,
    defaultOpacity: 0.45,
    infoNote: "Polygones de zones végétalisées (WFS IGN).",
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
    id: "bdtopo_surface_eau",
    label: "Surfaces d'eau",
    wfsLayerName: "BDTOPO_V3:surface_eau",
    defaultVisible: false,
    defaultOpacity: 0.6,
    infoNote: "Surfaces et plans d'eau (WFS IGN).",
    renderers: [
      {
        id: "bdtopo_surface_eau-fill",
        type: "fill",
        paint: {
          "fill-color": "#38bdf8",
          "fill-opacity": 0.6,
        },
        opacityPaintProperty: "fill-opacity",
      },
      {
        id: "bdtopo_surface_eau-outline",
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
    id: "bdtopo_cours_eau",
    label: "Cours d'eau",
    wfsLayerName: "BDTOPO_V3:cours_eau",
    defaultVisible: false,
    defaultOpacity: 1,
    infoNote: "Hydrographie linéaire issue de la BD TOPO (WFS IGN).",
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
    id: "bdtopo_batiment",
    label: "Bâtiments",
    wfsLayerName: "BDTOPO_V3:batiment",
    defaultVisible: false,
    defaultOpacity: 0.5,
    infoNote: "Empreintes des bâtiments (WFS IGN).",
    renderers: [
      {
        id: "bdtopo_batiment-fill",
        type: "fill",
        paint: {
          "fill-color": "#f97316",
          "fill-opacity": 0.5,
        },
        opacityPaintProperty: "fill-opacity",
      },
      {
        id: "bdtopo_batiment-outline",
        type: "line",
        paint: {
          "line-color": "#ea580c",
          "line-width": 0.6,
          "line-opacity": 0.7,
        },
      },
    ],
  },
  {
    id: "bdtopo_batiment_agricole",
    label: "Bâtiments agricoles",
    wfsLayerName: "BDTOPO_V3:batiment_agricole",
    defaultVisible: false,
    defaultOpacity: 0.5,
    infoNote: "Bâtiments agricoles recensés (WFS IGN).",
    renderers: [
      {
        id: "bdtopo_batiment_agricole-fill",
        type: "fill",
        paint: {
          "fill-color": "#f59e0b",
          "fill-opacity": 0.5,
        },
        opacityPaintProperty: "fill-opacity",
      },
      {
        id: "bdtopo_batiment_agricole-outline",
        type: "line",
        paint: {
          "line-color": "#b45309",
          "line-width": 0.6,
          "line-opacity": 0.7,
        },
      },
    ],
  },
  {
    id: "bdtopo_route",
    label: "Routes",
    wfsLayerName: "BDTOPO_V3:route",
    defaultVisible: false,
    defaultOpacity: 1,
    infoNote: "Réseau routier (WFS IGN).",
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
    id: "bdtopo_chemin",
    label: "Chemins",
    wfsLayerName: "BDTOPO_V3:chemin",
    defaultVisible: false,
    defaultOpacity: 1,
    infoNote: "Chemins ruraux et voies non revêtues (WFS IGN).",
    renderers: [
      {
        type: "line",
        paint: {
          "line-color": "#a16207",
          "line-width": 1,
        },
        opacityPaintProperty: "line-opacity",
      },
    ],
  },
  {
    id: "bdtopo_piste_aerodrome",
    label: "Pistes d'aérodrome",
    wfsLayerName: "BDTOPO_V3:piste_aerodrome",
    defaultVisible: false,
    defaultOpacity: 0.5,
    infoNote: "Pistes d'aérodrome et surfaces associées (WFS IGN).",
    renderers: [
      {
        id: "bdtopo_piste_aerodrome-fill",
        type: "fill",
        paint: {
          "fill-color": "#94a3b8",
          "fill-opacity": 0.5,
        },
        opacityPaintProperty: "fill-opacity",
      },
      {
        id: "bdtopo_piste_aerodrome-outline",
        type: "line",
        paint: {
          "line-color": "#475569",
          "line-width": 0.6,
          "line-opacity": 0.7,
        },
      },
    ],
  },
  {
    id: "bdtopo_commune",
    label: "Communes",
    wfsLayerName: "BDTOPO_V3:commune",
    defaultVisible: false,
    defaultOpacity: 0.25,
    infoNote: "Limites administratives communales (WFS IGN).",
    renderers: [
      {
        id: "bdtopo_commune-fill",
        type: "fill",
        paint: {
          "fill-color": "#fca5a5",
          "fill-opacity": 0.25,
        },
        opacityPaintProperty: "fill-opacity",
      },
      {
        id: "bdtopo_commune-outline",
        type: "line",
        paint: {
          "line-color": "#ef4444",
          "line-width": 0.8,
          "line-opacity": 0.7,
        },
      },
    ],
  },
  {
    id: "bdtopo_zone_habitation",
    label: "Zones d'habitation",
    wfsLayerName: "BDTOPO_V3:zone_habitation",
    defaultVisible: false,
    defaultOpacity: 0.4,
    infoNote: "Emprise des zones d'habitation (WFS IGN).",
    renderers: [
      {
        id: "bdtopo_zone_habitation-fill",
        type: "fill",
        paint: {
          "fill-color": "#fb923c",
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
    id: "bdtopo_lieu_dit_habite",
    label: "Lieux-dits habités",
    wfsLayerName: "BDTOPO_V3:lieu_dit_habite",
    defaultVisible: false,
    defaultOpacity: 0.9,
    infoNote: "Points toponymiques des lieux-dits habités (WFS IGN).",
    renderers: [
      {
        type: "circle",
        paint: {
          "circle-radius": 3.5,
          "circle-color": "#1d4ed8",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 0.7,
          "circle-opacity": 0.9,
        },
        opacityPaintProperty: "circle-opacity",
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
