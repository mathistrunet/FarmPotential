import { featureAreaM2 } from "./geometry.js";
import { intersectionArea } from "./overlapResolution.js";

export function getFeatureLabel(feature, index) {
  const props = feature?.properties || {};
  const label = props.nom_affiche || props.parcelleNo || props.numero || props.id || null;
  if (label != null && String(label).trim() !== "") return String(label);
  return `Parcelle ${index + 1}`;
}

export function getFeatureKey(feature, fallback) {
  if (feature?.id != null) return String(feature.id);
  if (feature?.properties?.__id != null) return String(feature.properties.__id);
  if (feature?.properties?.id != null) return String(feature.properties.id);
  return `feature-${fallback}`;
}

export function computeFeatureSimilarity(baseFeature, incomingFeature) {
  if (!baseFeature || !incomingFeature) return 0;
  const baseArea = featureAreaM2(baseFeature) ?? 0;
  const incomingArea = featureAreaM2(incomingFeature) ?? 0;
  const interArea = intersectionArea(baseFeature, incomingFeature);
  const maxArea = Math.max(baseArea, incomingArea, 1);
  return interArea / maxArea;
}

export function buildMatchSuggestions(
  baseFeatures,
  incomingFeatures,
  similarityThreshold = 0.95
) {
  return incomingFeatures.map((incomingFeature, incomingIndex) => {
    let bestMatch = null;
    baseFeatures.forEach((baseFeature, baseIndex) => {
      const similarity = computeFeatureSimilarity(baseFeature, incomingFeature);
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = {
          baseIndex,
          baseFeature,
          similarity,
        };
      }
    });
    if (!bestMatch || bestMatch.similarity < similarityThreshold) {
      return {
        incomingIndex,
        incomingFeature,
        baseIndex: null,
        baseFeature: null,
        similarity: bestMatch ? bestMatch.similarity : 0,
        isMatch: false,
      };
    }
    return {
      incomingIndex,
      incomingFeature,
      baseIndex: bestMatch.baseIndex,
      baseFeature: bestMatch.baseFeature,
      similarity: bestMatch.similarity,
      isMatch: true,
    };
  });
}
