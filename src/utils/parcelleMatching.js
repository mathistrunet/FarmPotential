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

function buildBestMatches(baseFeatures, incomingFeatures) {
  const bestByIncoming = incomingFeatures.map(() => null);
  const bestByBase = baseFeatures.map(() => null);

  incomingFeatures.forEach((incomingFeature, incomingIndex) => {
    baseFeatures.forEach((baseFeature, baseIndex) => {
      const similarity = computeFeatureSimilarity(baseFeature, incomingFeature);

      if (!bestByIncoming[incomingIndex] || similarity > bestByIncoming[incomingIndex].similarity) {
        bestByIncoming[incomingIndex] = { baseIndex, similarity };
      }

      if (!bestByBase[baseIndex] || similarity > bestByBase[baseIndex].similarity) {
        bestByBase[baseIndex] = { incomingIndex, similarity };
      }
    });
  });

  return { bestByIncoming, bestByBase };
}

export function buildMatchSuggestions(
  baseFeatures,
  incomingFeatures,
  similarityThreshold = 0.95
) {
  const { bestByIncoming, bestByBase } = buildBestMatches(baseFeatures, incomingFeatures);

  return incomingFeatures.map((incomingFeature, incomingIndex) => {
    const best = bestByIncoming[incomingIndex];
    const bestSimilarity = best?.similarity ?? 0;
    const baseIndex = best?.baseIndex ?? null;
    const reciprocal =
      baseIndex != null &&
      bestByBase[baseIndex] &&
      bestByBase[baseIndex].incomingIndex === incomingIndex;

    if (baseIndex == null || bestSimilarity < similarityThreshold || !reciprocal) {
      return {
        incomingIndex,
        incomingFeature,
        baseIndex: null,
        baseFeature: null,
        similarity: bestSimilarity,
        isMatch: false,
      };
    }

    return {
      incomingIndex,
      incomingFeature,
      baseIndex,
      baseFeature: baseFeatures[baseIndex] ?? null,
      similarity: bestSimilarity,
      isMatch: true,
    };
  });
}
