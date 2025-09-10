const BASE_URL =
  import.meta.env.VITE_IGN_WMTS_BASE || "https://data.geopf.fr/private/wmts";
const API_KEY = import.meta.env.VITE_IGN_API_KEY || "geoportail";
const LAYER = "INRA.CARTE.SOLS";
const STYLE = "CARTE DES SOLS";
const INFO_FORMAT = "application/json";
const TILEMATRIXSET = "PM";

// Build a WMTS GetFeatureInfo URL using tile coordinates
export function buildGetFeatureInfoURL(map, pointPx) {
  const lngLat = map.unproject(pointPx);
  const zoom = Math.floor(map.getZoom());
  const n = 2 ** zoom;

  const xtile = ((lngLat.lng + 180) / 360) * n;
  const ytile =
    ((1 -
      Math.log(
        Math.tan((lngLat.lat * Math.PI) / 180) +
          1 / Math.cos((lngLat.lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
    n;

  const tilecol = Math.floor(xtile);
  const tilerow = Math.floor(ytile);
  const i = Math.floor((xtile - tilecol) * 256);
  const j = Math.floor((ytile - tilerow) * 256);

  const params = new URLSearchParams({
    SERVICE: "WMTS",
    REQUEST: "GetFeatureInfo",
    VERSION: "1.0.0",
    LAYER,
    STYLE,
    TILEMATRIXSET,
    TILEMATRIX: String(zoom),
    TILECOL: String(tilecol),
    TILEROW: String(tilerow),
    FORMAT: "image/png",
    INFOFORMAT: INFO_FORMAT,
    I: String(i),
    J: String(j),
    apikey: API_KEY,
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
