// src/utils/rrpGetFeatureInfo.js
// Pas de proj4: on calcule EPSG:3857 à la main pour éviter l'inversion lat/lon.
const BASE_URL = import.meta.env?.VITE_IGN_WMS_R_BASE ?? "https://data.geopf.fr/wms-r/wms";
const LAYER = "INRA.CARTE.SOLS";
const CRS = "EPSG:3857";
const VERSION = "1.3.0";
const INFO_FORMAT = "application/json";
const IMAGE_FORMAT = "image/png";

const R = 6378137;
const toRad = (deg) => (deg * Math.PI) / 180;
function lonLatTo3857(lon, lat) {
  // Clamp latitude to Mercator limits
  const clampedLat = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const x = R * toRad(lon);
  const y = R * Math.log(Math.tan(Math.PI / 4 + toRad(clampedLat) / 2));
  return { x, y };
}

export function buildGetFeatureInfoURL(map, pointPx) {
  const b = map.getBounds(); // LngLatBounds
  // Attention: on passe (lon, lat) dans cet ordre
  const swm = lonLatTo3857(b.getWest(), b.getSouth());
  const nem = lonLatTo3857(b.getEast(), b.getNorth());

  // Sécuriser l’ordre min/max
  const minx = Math.min(swm.x, nem.x);
  const miny = Math.min(swm.y, nem.y);
  const maxx = Math.max(swm.x, nem.x);
  const maxy = Math.max(swm.y, nem.y);
  const bbox = `${minx},${miny},${maxx},${maxy}`;

  // Utiliser les dimensions en CSS px (cohérent avec e.point)
  const el = map.getCanvas();
  const width = Math.round(el.clientWidth);
  const height = Math.round(el.clientHeight);

  const I = Math.round(pointPx.x);
  const J = Math.round(pointPx.y);

  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetFeatureInfo",
    VERSION,
    LAYERS: LAYER,
    QUERY_LAYERS: LAYER,
    STYLES: "",
    FORMAT: IMAGE_FORMAT,            // ✅ important
    INFO_FORMAT: INFO_FORMAT,        // ✅ JSON attendu
    CRS,                             // WMS 1.3.0 → CRS
    BBOX: bbox,
    WIDTH: String(width),
    HEIGHT: String(height),
    I: String(I),
    J: String(J),
    FEATURE_COUNT: "1",
  });

  // Garder les virgules du BBOX (ne pas les encoder)
  const qs = params.toString().replace(encodeURIComponent(bbox), bbox);
  return `${BASE_URL}?${qs}`;
}

export async function getRrpAtPoint(map, pointPx, { signal } = {}) {
  const url = buildGetFeatureInfoURL(map, pointPx);
  console.debug("[RRP] GetFeatureInfo URL:", url);

  const resp = await fetch(url, { mode: "cors", signal });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error("[RRP] HTTP", resp.status, body);
    throw new Error(`WMS GetFeatureInfo ${resp.status}`);
  }

  const json = await resp.json();
  const feature = json?.features?.[0];
  const properties = feature?.properties ?? null;
  const proportions = properties
    ? Object.fromEntries(
        Object.entries(properties).filter(([k]) =>
          /pct|pourc|percent|prop|taux/i.test(k)
        )
      )
    : null;

  return { properties, proportions };
}
