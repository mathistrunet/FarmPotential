import { describe, expect, it } from "vitest";
import { buildMatchSuggestions, computeFeatureSimilarity } from "./parcelleMatching";

function squareFeature(id, x, y, size = 1) {
  return {
    type: "Feature",
    id,
    geometry: {
      type: "Polygon",
      coordinates: [[
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
        [x, y],
      ]],
    },
    properties: { id },
  };
}

describe("parcelleMatching", () => {
  it("auto-match when overlap is >= 95% and reciprocal", () => {
    const base = [squareFeature("base-1", 0, 0)];
    const incoming = [squareFeature("in-1", 0, 0)];

    const suggestions = buildMatchSuggestions(base, incoming, 0.95);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].isMatch).toBe(true);
    expect(suggestions[0].baseIndex).toBe(0);
    expect(suggestions[0].similarity).toBeCloseTo(1, 6);
  });

  it("does not auto-match ambiguous duplicates", () => {
    const base = [squareFeature("base-1", 0, 0)];
    const incoming = [squareFeature("in-1", 0, 0), squareFeature("in-2", 0, 0)];

    const suggestions = buildMatchSuggestions(base, incoming, 0.95);
    const autoCount = suggestions.filter((item) => item.isMatch).length;
    expect(autoCount).toBe(1);
    expect(suggestions.some((item) => !item.isMatch && item.similarity >= 0.95)).toBe(true);
  });

  it("keeps unmatched when overlap is below 95%", () => {
    const baseFeature = squareFeature("base-1", 0, 0, 1);
    const incomingFeature = squareFeature("in-1", 0.5, 0, 1);
    const similarity = computeFeatureSimilarity(baseFeature, incomingFeature);

    expect(similarity).toBeLessThan(0.95);

    const suggestions = buildMatchSuggestions([baseFeature], [incomingFeature], 0.95);
    expect(suggestions[0].isMatch).toBe(false);
  });
});
