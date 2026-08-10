import { describe, expect, it } from "vitest";
import { featuresBounds } from "./geometry";

const polygon = (coordinates) => ({
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates: [coordinates] },
});

describe("featuresBounds", () => {
  it("encadre un polygone unique", () => {
    const bounds = featuresBounds([
      polygon([[2, 48], [3, 48], [3, 49], [2, 49], [2, 48]]),
    ]);
    expect(bounds).toEqual([
      [2, 48],
      [3, 49],
    ]);
  });

  it("réunit plusieurs parcelles, y compris des multipolygones", () => {
    const bounds = featuresBounds([
      polygon([[2, 48], [3, 48], [3, 49], [2, 48]]),
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "MultiPolygon",
          coordinates: [[[[0.5, 47], [1, 47], [1, 47.5], [0.5, 47]]]],
        },
      },
    ]);
    expect(bounds).toEqual([
      [0.5, 47],
      [3, 49],
    ]);
  });

  it("ignore les coordonnées invalides", () => {
    const bounds = featuresBounds([
      polygon([[2, 48], [Number.NaN, 48], [3, 49], [2, 48]]),
    ]);
    expect(bounds).toEqual([
      [2, 48],
      [3, 49],
    ]);
  });

  it("renvoie null sans géométrie exploitable", () => {
    expect(featuresBounds([])).toBeNull();
    expect(featuresBounds(null)).toBeNull();
    expect(featuresBounds([{ type: "Feature", properties: {} }])).toBeNull();
  });
});
