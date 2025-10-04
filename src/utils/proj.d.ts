declare module "./proj" {
  export type Proj4Instance = (...args: unknown[]) => unknown;
  export const toWgs84: (coords: readonly [number, number]) => [number, number];
  const proj4: Proj4Instance;
  export default proj4;
}

declare module "../utils/proj.js" {
  export type Proj4Instance = (...args: unknown[]) => unknown;
  export const toWgs84: (coords: readonly [number, number]) => [number, number];
  const proj4: Proj4Instance;
  export default proj4;
}
