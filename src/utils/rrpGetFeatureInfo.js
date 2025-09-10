import proj4 from "proj4";

const BASE_URL = import.meta.env.VITE_IGN_WMS_R_BASE || "https://data.geopf.fr/wms-r/wms";
const LAYER = "INRA.CARTE.SOLS";
const INFO_FORMAT = "application/json";
const CRS = "EPSG:3857";

export function buildGetFeatureInfoURL(map, pointPx) {
  const bounds = map.getBounds();
  const sw = proj4("EPSG:4326", CRS, [bounds.getWest(), bounds.getSouth()]);
  const ne = proj4("EPSG:4326", CRS, [bounds.getEast(), bounds.getNorth()]);
  const bbox = `${sw[0]},${sw[1]},${ne[0]},${ne[1]}`;

  const canvas = map.getCanvas();
  const rect = canvas.getBoundingClientRect();
  const width = canvas.width;
  const height = canvas.height;
  const x = Math.round(pointPx.x * (width / rect.width));
  const y = Math.round(pointPx.y * (height / rect.height));

  const params = new URLSearchParams({
    service: "WMS",
    request: "GetFeatureInfo",
    version: "1.3.0",
    layers: LAYER,
    query_layers: LAYER,
    info_format: INFO_FORMAT,
    crs: CRS,
    bbox,
    width: String(width),
    height: String(height),
    i: String(x),
    j: String(y),
    styles: "",
  });

  return `${BASE_URL}?${params.toString()}`;
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
