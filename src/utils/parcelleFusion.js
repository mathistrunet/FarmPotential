import polygonClipping from "polygon-clipping";

import { featureAreaM2 } from "./geometry";

function geometryToUnionParts(geometry) {
  if (!geometry?.coordinates) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function normalizeUnionResult(unionResult) {
  if (!Array.isArray(unionResult) || unionResult.length === 0) {
    return null;
  }
  if (unionResult.length === 1) {
    return { type: "Polygon", coordinates: unionResult[0] };
  }
  return { type: "MultiPolygon", coordinates: unionResult };
}

function removeInteriorRingsFromGeometry(geometry) {
  if (!geometry?.coordinates) return geometry;
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.length ? [geometry.coordinates[0]] : [],
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.length ? [polygon[0]] : [],
      ),
    };
  }
  return geometry;
}

function buildMergedProperties(baseProperties, featuresToMerge) {
  const totalSurfaceHa = featuresToMerge.reduce((sum, feature) => {
    const areaM2 = featureAreaM2(feature);
    if (!Number.isFinite(areaM2)) return sum;
    return sum + areaM2 / 10000;
  }, 0);

  return {
    ...(baseProperties || {}),
    surfaceHa: Number(totalSurfaceHa.toFixed(4)),
  };
}

export function mergeFeaturesByIds(features, selectedIds, keepId) {
  const selectedSet = new Set((selectedIds || []).map((id) => String(id)));
  const selectedFeatures = (features || []).filter((feature) => selectedSet.has(String(feature.id)));
  if (selectedFeatures.length < 2) {
    throw new Error("Sélectionnez au moins deux parcelles pour les fusionner.");
  }

  const baseFeature = selectedFeatures.find((feature) => String(feature.id) === String(keepId));
  if (!baseFeature) {
    throw new Error("Parcelle de référence introuvable pour conserver les données.");
  }

  const unionInputs = selectedFeatures.flatMap((feature) => geometryToUnionParts(feature.geometry));
  if (!unionInputs.length) {
    throw new Error("Impossible de fusionner des parcelles sans géométrie valide.");
  }

  const unionResult = polygonClipping.union(...unionInputs);
  const mergedGeometry = removeInteriorRingsFromGeometry(normalizeUnionResult(unionResult));
  if (!mergedGeometry) {
    throw new Error("La fusion géométrique a échoué.");
  }

  return {
    feature: {
      type: "Feature",
      id: baseFeature.id,
      properties: buildMergedProperties(baseFeature.properties, selectedFeatures),
      geometry: mergedGeometry,
    },
    removedIds: selectedFeatures
      .filter((feature) => String(feature.id) !== String(baseFeature.id))
      .map((feature) => feature.id),
  };
}
