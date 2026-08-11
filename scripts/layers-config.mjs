// Description des couches cartographiques hébergées hors du dépôt.
//
// Elles sont publiées dans les Releases GitHub (scripts/publish-layers.mjs) et
// téléchargées à la demande par le serveur local (scripts/layer-store.mjs).

import path from "node:path";

export const REPO = process.env.STUDIO_PARCELLAIRE_REPO || "mathistrunet/StudioParcellaire";

export const PUBLIC_DATA_DIR = path.resolve(process.cwd(), "public", "data");
export const MANIFEST_PATH = path.resolve(process.cwd(), "data-layers.json");

export const DATASETS = [
  {
    id: "soilmap",
    directory: "soilmap_dep",
    extensions: [".gpkg"],
    tag: "layers-soilmap-v1",
    title: "Couches — carte des sols France (par département)",
    notes:
      "Cartes pédologiques départementales (RRP / IGCS) utilisées par la couche « Carte des sols France ». " +
      "Un fichier par département, téléchargé à la demande par l'application.",
  },
  {
    id: "toponymie",
    directory: "TOPONYMIE",
    extensions: [".gpkg"],
    tag: "layers-toponymie-v1",
    title: "Couches — toponymie (par région)",
    notes:
      "Points de toponymie utilisés pour le nommage automatique des parcelles. " +
      "Un fichier par région, téléchargé à la demande par l'application.",
  },
  {
    id: "rpg-romania",
    directory: "RPG Rom",
    extensions: [".gpkg"],
    tag: "layers-rpg-romania-v1",
    title: "Couches — parcellaire de référence Roumanie (par région)",
    notes:
      "Parcellaire de référence roumain, un fichier par région. " +
      "Téléchargé à la demande, uniquement pour les régions visibles à l'écran.",
  },
  {
    id: "referentiels",
    directory: ".",
    extensions: [".csv"],
    tag: "layers-referentiels-v1",
    title: "Couches — référentiels cultures et sols",
    notes:
      "Tables de correspondance légères (cultures Assolia, types de sol RRP). " +
      "Elles restent nécessaires au fonctionnement courant de l'application.",
  },
];

/** Retrouve la description d'un jeu de données par son identifiant. */
export const datasetById = (id) => DATASETS.find((dataset) => dataset.id === id) || null;
