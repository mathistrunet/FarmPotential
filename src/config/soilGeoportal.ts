import type { LngLatBBox } from "../services/rrpLocal";

const GEO_PORTAIL_KEY =
  import.meta.env.VITE_GEO_PORTAIL_API_KEY?.trim() || null;

const SOIL_LAYER = import.meta.env.VITE_GEO_PORTAIL_SOIL_LAYER?.trim() || "INRA.CARTE.SOLS";

const BASE_WMS_URL = "https://data.geopf.fr/wms-r/wms";

const MAX_MERCATOR_LAT = 85.05112877980659;
const EARTH_RADIUS = 40075016.68557849 / (2 * Math.PI);

export const GEO_PORTAIL_SOIL_DEFAULT_OPACITY = 0.85;

export function buildSoilWmsUrl(
  bounds: LngLatBBox,
  width = 512,
  height = 512
): string {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const [minX, minY] = projectToMercator(minLng, minLat);
  const [maxX, maxY] = projectToMercator(maxLng, maxLat);

  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: SOIL_LAYER,
    STYLES: "",
    FORMAT: "image/png",
    CRS: "EPSG:3857",
    BBOX: `${minX},${minY},${maxX},${maxY}`,
    WIDTH: String(width),
    HEIGHT: String(height),
  });

  if (GEO_PORTAIL_KEY) {
    params.set("apikey", GEO_PORTAIL_KEY);
  }

  return `${BASE_WMS_URL}?${params.toString()}`;
}

function projectToMercator(lng: number, lat: number): [number, number] {
  const clampedLat = clampLatitude(lat);
  const lambda = (lng * Math.PI) / 180;
  const phi = (clampedLat * Math.PI) / 180;
  const x = EARTH_RADIUS * lambda;
  const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2));
  return [x, y];
}

function clampLatitude(lat: number): number {
  return Math.max(Math.min(lat, MAX_MERCATOR_LAT), -MAX_MERCATOR_LAT);
}
