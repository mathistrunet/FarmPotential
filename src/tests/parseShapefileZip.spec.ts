import { describe, expect, it } from "vitest";
import { normalizeShapefileGeoJSON } from "../services/shapefileZip";
import { toWgs84 } from "../utils/proj";

describe("normalizeShapefileGeoJSON", () => {
  it("reprojects Lambert-93 polygons and preserves parcel metadata", () => {
    const lambertCoords = [
      [
        [
          [700000, 6600000],
          [700100, 6600000],
          [700100, 6600100],
          [700000, 6600100],
          [700000, 6600000],
        ],
      ],
    ];

    const collection = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "MultiPolygon" as const,
            coordinates: lambertCoords,
          },
          properties: {
            CODE_EXPLO: "123",
            NOM_PARCEL: "PARCELLE A",
            CP_CULTU: "bth",
            CULT_PREC: "jac",
            CULT_PREC2: "ble",
            TYPE_SOL: "Argile",
          },
          id: "feat-1",
        },
      ],
    };

    const features = normalizeShapefileGeoJSON(collection);
    expect(features).toHaveLength(1);
    const feature = features[0];

    expect(feature.geometry.type).toBe("Polygon");
    const firstPoint = feature.geometry.coordinates[0][0];
    const [expectedLon, expectedLat] = toWgs84([700000, 6600000]);
    expect(firstPoint[0]).toBeCloseTo(expectedLon, 6);
    expect(firstPoint[1]).toBeCloseTo(expectedLat, 6);

    expect(feature.properties.CODE_EXPLO).toBe("123");
    expect(feature.properties.code_exploitation).toBe("123");
    expect(feature.properties.nom_parcelle).toBe("PARCELLE A");
    expect(feature.properties.CP_CULTU).toBe("BTH");
    expect(feature.properties.code).toBe("BTH");
    expect(feature.properties.culture_prec).toBe("JAC");
    expect(feature.properties.culture_prec2).toBe("BLE");
    expect(feature.properties.type_sol).toBe("Argile");
  });

  it("keeps WGS84 coordinates intact and splits multipolygons", () => {
    const collection = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "MultiPolygon" as const,
            coordinates: [
              [
                [
                  [1, 44],
                  [1.001, 44],
                  [1.001, 44.001],
                  [1, 44.001],
                  [1, 44],
                ],
              ],
              [
                [
                  [1.01, 44.01],
                  [1.02, 44.01],
                  [1.02, 44.02],
                  [1.01, 44.02],
                  [1.01, 44.01],
                ],
              ],
            ],
          },
          properties: {},
          id: "multi",
        },
      ],
    };

    const features = normalizeShapefileGeoJSON(collection);
    expect(features).toHaveLength(2);
    expect(features[0].geometry.coordinates[0][0][0]).toBeCloseTo(1, 6);
    expect(features[0].properties._multipolygon_index).toBe(0);
    expect(features[1].properties._multipolygon_index).toBe(1);
  });
});
