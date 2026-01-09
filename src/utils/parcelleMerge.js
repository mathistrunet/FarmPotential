import { featureAreaM2 } from "./geometry";
import { intersectionArea, updateDrawFeatureProperties } from "./overlapResolution";

function filterMergeProps(props) {
  return Object.fromEntries(
    Object.entries(props || {}).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
}

function mergeProperties(props) {
  return filterMergeProps(props);
}

function getFeatureLabel(feature, index) {
  const props = feature?.properties || {};
  const label = props.nom_affiche || props.numero || props.id || null;
  if (label != null && String(label).trim() !== "") return String(label);
  return `Parcelle ${index + 1}`;
}

export function mergeTelepacFeatures(draw, incomingFeatures) {
  const existing = draw.getAll()?.features ?? [];
  if (!existing.length) {
    return { toAdd: incomingFeatures, didMerge: false, mismatches: [] };
  }

  const similarityThreshold = 0.95;
  const existingEntries = existing.map((feature, index) => ({
    feature,
    id: feature.id ?? `existing-${index}`,
    hasId: feature.id != null,
    area: featureAreaM2(feature) ?? 0,
  }));
  const incomingEntries = incomingFeatures.map((feature, index) => ({
    feature,
    index,
    area: featureAreaM2(feature) ?? 0,
  }));

  const overlapsByIncoming = incomingEntries.map(() => []);
  const overlapsByExisting = existingEntries.map(() => []);
  incomingEntries.forEach((incomingEntry, incomingIndex) => {
    existingEntries.forEach((existingEntry, existingIndex) => {
      const interArea = intersectionArea(existingEntry.feature, incomingEntry.feature);
      if (interArea <= 0) return;
      const maxArea = Math.max(existingEntry.area, incomingEntry.area, 1);
      const similarity = interArea / maxArea;
      overlapsByIncoming[incomingIndex].push({
        existingIndex,
        interArea,
        similarity,
      });
      overlapsByExisting[existingIndex].push({
        incomingIndex,
        interArea,
      });
    });
  });

  const toAdd = [];
  const matchedExistingIds = new Set();
  const existingToRemove = new Set();
  const mismatches = [];
  const mismatchIncomingIndexes = new Map();

  overlapsByIncoming.forEach((overlaps, incomingIndex) => {
    if (overlaps.length) {
      const maxSimilarity = Math.max(...overlaps.map((item) => item.similarity));
      if (maxSimilarity < similarityThreshold) {
        mismatches.push({
          label: getFeatureLabel(incomingEntries[incomingIndex]?.feature, incomingIndex),
          maxSimilarity,
        });
        mismatchIncomingIndexes.set(incomingIndex, maxSimilarity);
      }
    }
    overlaps.forEach(({ existingIndex, similarity }) => {
      if (similarity < similarityThreshold) return;
      const existingEntry = existingEntries[existingIndex];
      if (!existingEntry) return;
      matchedExistingIds.add(existingEntry.id);
      updateDrawFeatureProperties(
        draw,
        existingEntry.feature,
        mergeProperties(incomingEntries[incomingIndex].feature.properties || {})
      );
    });
  });

  const splitExistingIds = new Set();
  overlapsByExisting.forEach((overlaps, existingIndex) => {
    if (overlaps.length < 2) return;
    const existingEntry = existingEntries[existingIndex];
    if (!existingEntry || existingEntry.area <= 0) return;
    const totalIntersection = overlaps.reduce((sum, item) => sum + item.interArea, 0);
    if (totalIntersection / existingEntry.area >= similarityThreshold) {
      splitExistingIds.add(existingEntry.id);
    }
  });

  incomingEntries.forEach((incomingEntry, incomingIndex) => {
    const overlaps = overlapsByIncoming[incomingIndex];
    const hasSimilarityMatch = overlaps.some(
      ({ existingIndex, similarity }) =>
        similarity >= similarityThreshold &&
        matchedExistingIds.has(existingEntries[existingIndex]?.id)
    );
    if (hasSimilarityMatch) return;
    if (mismatchIncomingIndexes.has(incomingIndex)) {
      const mismatchSimilarity = mismatchIncomingIndexes.get(incomingIndex);
      toAdd.push({
        ...incomingEntry.feature,
        properties: {
          ...(incomingEntry.feature.properties || {}),
          import_mismatch: true,
          import_mismatch_similarity: mismatchSimilarity,
        },
      });
      return;
    }

    const splitOverlap = overlaps
      .map(({ existingIndex, interArea }) => ({
        existingEntry: existingEntries[existingIndex],
        interArea,
      }))
      .filter(
        ({ existingEntry }) =>
          existingEntry && splitExistingIds.has(existingEntry.id)
      )
      .sort((a, b) => b.interArea - a.interArea)[0];

    if (splitOverlap?.existingEntry) {
      const mergedProps = {
        ...(splitOverlap.existingEntry.feature.properties || {}),
        ...filterMergeProps(incomingEntry.feature.properties || {}),
      };
      toAdd.push({
        ...incomingEntry.feature,
        properties: mergedProps,
      });
      existingToRemove.add(splitOverlap.existingEntry.id);
      return;
    }

    const overlappingExisting = overlaps
      .map(({ existingIndex }) => existingEntries[existingIndex])
      .filter((entry) => entry && !matchedExistingIds.has(entry.id));
    if (overlappingExisting.length) {
      overlappingExisting.forEach((entry) => existingToRemove.add(entry.id));
      toAdd.push(incomingEntry.feature);
      return;
    }

    toAdd.push(incomingEntry.feature);
  });

  existingEntries.forEach((entry) => {
    if (!entry.hasId) return;
    if (existingToRemove.has(entry.id) && !matchedExistingIds.has(entry.id)) {
      draw.delete(entry.id);
    }
  });

  return { toAdd, didMerge: true, mismatches };
}
