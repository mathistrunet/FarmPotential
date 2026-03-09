declare module "polygon-clipping" {
  export type Pair = [number, number];
  export type Polygon = Pair[][];
  export type MultiPolygon = Polygon[];

  export function intersection(
    geom: Polygon | MultiPolygon,
    ...geoms: Array<Polygon | MultiPolygon>
  ): MultiPolygon;
}
