// src/features/map/drawFeatures.js
//
// Lecture des parcelles détenues par Mapbox Draw.

/**
 * Parcelles exploitables telles que Mapbox Draw les détient.
 *
 * Les MultiPolygon comptent : un import CSV ou shapefile en produit, et les
 * écarter ici les faisait disparaître du tableau à la première relecture du draw
 * alors qu'elles restaient dessinées sur la carte. Le nombre de parcelles
 * oscillait alors entre deux valeurs à chaque aller-retour de synchronisation,
 * ce qui faisait clignoter la liste, les filtres et jusqu'aux parcelles
 * supprimées.
 *
 * Les points et lignes, eux, ne sont pas des parcelles : Draw en crée pendant
 * l'édition des sommets.
 */
export function readPolygonsFromDraw(draw) {
  if (!draw || typeof draw.getAll !== "function") return [];
  const data = draw.getAll();
  const features = data && Array.isArray(data.features) ? data.features : [];
  return features
    .filter(
      (feature) =>
        feature?.geometry?.type === "Polygon" || feature?.geometry?.type === "MultiPolygon"
    )
    .map((feature) => ({ ...feature, properties: feature.properties || {} }));
}
