import { describe, expect, it } from "vitest";

import { toWgs84 } from "./proj";
import { resolveOverlappingParcels } from "./overlapResolution";

function rectangleFromLambert(x, y, width, height) {
  const corners = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
    [x, y],
  ].map(toWgs84);

  return {
    type: "Polygon",
    coordinates: [corners],
  };
}

function createDraw(features) {
  const updated = [];
  return {
    getAll: () => ({ features }),
    setFeatureProperty: (id, key, value) => {
      updated.push({ id, key, value });
    },
    delete: () => {},
    add: () => {},
    updated,
  };
}

describe("resolveOverlappingParcels", () => {
  it("ignores tiny overlaps under 1m² tolerance for warnings", () => {
    const featureA = {
      id: "a",
      type: "Feature",
      properties: {},
      geometry: rectangleFromLambert(700000, 6600000, 10, 10),
    };
    const featureB = {
      id: "b",
      type: "Feature",
      properties: {},
      geometry: rectangleFromLambert(700009.2, 6600000, 10, 10),
    };

    const draw = createDraw([featureA, featureB]);
    resolveOverlappingParcels(draw, { mode: "warn" });

    const warningById = Object.fromEntries(
      draw.updated
        .filter((entry) => entry.key === "overlap_warning")
        .map((entry) => [entry.id, entry.value])
    );

    expect(warningById.a).toBe(false);
    expect(warningById.b).toBe(false);
  });

  it("keeps warning when overlap is larger than tolerance", () => {
    const featureA = {
      id: "a",
      type: "Feature",
      properties: {},
      geometry: rectangleFromLambert(700000, 6600000, 10, 10),
    };
    const featureB = {
      id: "b",
      type: "Feature",
      properties: {},
      geometry: rectangleFromLambert(700008.8, 6600000, 10, 10),
    };

    const draw = createDraw([featureA, featureB]);
    resolveOverlappingParcels(draw, { mode: "warn" });

    const warningById = Object.fromEntries(
      draw.updated
        .filter((entry) => entry.key === "overlap_warning")
        .map((entry) => [entry.id, entry.value])
    );

    expect(warningById.a).toBe(true);
    expect(warningById.b).toBe(true);
  });
});
