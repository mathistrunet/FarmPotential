const BASE_URL =
  import.meta.env.VITE_IGN_WMS_R_BASE || "https://data.geopf.fr/wms-r/wms";
const LAYER = "INRA.CARTE.SOLS";
const INFO_FORMAT = "application/json";

// Convert lon/lat (EPSG:4326) to WebMercator (EPSG:3857)
function toMercator(lng, lat) {
  const R = 6378137;
  const x = (lng * Math.PI) / 180 * R;
  const y =
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R;
  return [x, y];
}

// Build a WMS GetFeatureInfo URL
export function buildGetFeatureInfoURL(map, pointPx) {
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const [minX, minY] = toMercator(sw.lng, sw.lat);
  const [maxX, maxY] = toMercator(ne.lng, ne.lat);
  const bbox = `${minX},${minY},${maxX},${maxY}`;

  const { width, height } = map.getCanvas();
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetFeatureInfo",
    VERSION: "1.3.0",
    LAYERS: LAYER,
    QUERY_LAYERS: LAYER,
    STYLES: "",
    CRS: "EPSG:3857",
    WIDTH: String(width),
    HEIGHT: String(height),
    I: String(Math.round(pointPx.x)),
    J: String(Math.round(pointPx.y)),
    INFO_FORMAT: INFO_FORMAT,
  });
  params.set("BBOX", bbox);
  // Preserve comma-separated bbox
  const query = params.toString().replaceAll("%2C", ",");
  return `${BASE_URL}?${query}`;
}

export async function getRrpAtPoint(map, pointPx, { signal } = {}) {
  const url = buildGetFeatureInfoURL(map, pointPx);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const feature = json?.features && json.features[0];
  const properties = feature ? feature.properties || {} : null;
  const proportions = properties
    ? Object.fromEntries(
        Object.entries(properties).filter(([k]) =>
          /pct|pourc|prc|percent|taux/i.test(k)
        )
      )
    : null;
  return { properties, proportions };
}
