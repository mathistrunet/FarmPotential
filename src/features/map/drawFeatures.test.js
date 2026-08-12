import { describe, expect, it } from "vitest";
import { readPolygonsFromDraw } from "./drawFeatures";

const drawStub = (features) => ({
  getAll: () => ({ type: "FeatureCollection", features }),
});

const polygone = (id) => ({
  id,
  type: "Feature",
  properties: { nom_parcelle: id },
  geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
});

const multiPolygone = (id) => ({
  id,
  type: "Feature",
  properties: { nom_parcelle: id },
  geometry: {
    type: "MultiPolygon",
    coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[2, 2], [3, 2], [3, 3], [2, 2]]]],
  },
});

describe("readPolygonsFromDraw", () => {
  it("conserve les MultiPolygon", () => {
    // Un import CSV ou shapefile en produit ; les écarter les faisait
    // disparaître du tableau tout en les laissant dessinées sur la carte.
    const result = readPolygonsFromDraw(drawStub([polygone("p1"), multiPolygone("p2")]));
    expect(result.map((feature) => feature.id)).toEqual(["p1", "p2"]);
  });

  it("écarte les points et lignes créés par l'édition des sommets", () => {
    const result = readPolygonsFromDraw(
      drawStub([
        polygone("p1"),
        { id: "v1", type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } },
        { id: "l1", type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } },
      ])
    );
    expect(result.map((feature) => feature.id)).toEqual(["p1"]);
  });

  it("garantit un objet de propriétés", () => {
    const sansProps = { id: "p1", type: "Feature", geometry: polygone("p1").geometry };
    expect(readPolygonsFromDraw(drawStub([sansProps]))[0].properties).toEqual({});
  });

  it("ne relit pas deux fois le même tableau de features", () => {
    const source = [polygone("p1")];
    const result = readPolygonsFromDraw(drawStub(source));
    // Copie de surface : modifier la liste rendue ne doit pas toucher le draw.
    expect(result[0]).not.toBe(source[0]);
    expect(result[0].geometry).toBe(source[0].geometry);
  });

  it("tolère un draw absent ou vide", () => {
    expect(readPolygonsFromDraw(null)).toEqual([]);
    expect(readPolygonsFromDraw({})).toEqual([]);
    expect(readPolygonsFromDraw(drawStub(null))).toEqual([]);
  });
});
