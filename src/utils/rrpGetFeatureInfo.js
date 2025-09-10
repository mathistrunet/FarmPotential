import proj4 from "proj4";

const BASE_URL =
  import.meta.env.VITE_IGN_WMS_R_BASE || "https://data.geopf.fr/wms-r/wms";
const LAYER = "INRA.CARTE.SOLS";
const INFO_FORMAT = "application/json";
const CRS = "EPSG:3857";
const VERSION = "1.3.0";


export function buildGetFeatureInfoURL(map, pointPx) {
  const bounds = map.getBounds();
  const sw = proj4("EPSG:4326", CRS, [bounds.getWest(), bounds.getSouth()]);
  const ne = proj4("EPSG:4326", CRS, [bounds.getEast(), bounds.getNorth()]);
  const bbox = `${sw[0]},${sw[1]},${ne[0]},${ne[1]}`;

  const canvas = map.getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const x = Math.round(pointPx.x);
  const y = Math.round(pointPx.y);

  const crsParam = VERSION === "1.3.0" ? "CRS" : "SRS";
  const xyParamX = VERSION === "1.3.0" ? "I" : "X";
  const xyParamY = VERSION === "1.3.0" ? "J" : "Y";

  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetFeatureInfo",
    VERSION,
    LAYERS: LAYER,
    QUERY_LAYERS: LAYER,
    INFO_FORMAT: INFO_FORMAT,
    STYLES: "",
    [crsParam]: CRS,
    WIDTH: String(width),
    HEIGHT: String(height),
    BBOX: bbox,
    [xyParamX]: String(x),
    [xyParamY]: String(y),
  });

  // Preserve commas in the BBOX parameter
  let query = params.toString();
  query = query.replace(`BBOX=${encodeURIComponent(bbox)}`, `BBOX=${bbox}`);
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
