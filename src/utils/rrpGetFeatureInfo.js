// src/utils/rrpGetFeatureInfo.js
const WMS_V_BASE = import.meta.env?.VITE_IGN_WMS_V_BASE ?? "https://data.geopf.fr/wms-v/ows";
const WMS_R_BASE = import.meta.env?.VITE_IGN_WMS_R_BASE ?? "https://data.geopf.fr/wms-r/wms";

// ⚠︎ En vecteur, la couche “sols” est suffixée :
const LAYER_V = import.meta.env?.VITE_IGN_SOILS_LAYER_V ?? "INRA.CARTE.SOLS:geoportail_vf";
// En raster on garde l’alias court :
const LAYER_R = import.meta.env?.VITE_IGN_SOILS_LAYER_R ?? "INRA.CARTE.SOLS";

const CRS = "EPSG:3857";
const VERSION = "1.3.0";
const INFO_FORMAT = "application/json";
const IMAGE_FORMAT = "image/png";

const R = 6378137;
const toRad = (deg) => (deg * Math.PI) / 180;
function lonLatTo3857(lon, lat) {
  const clamped = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  return {
    x: R * toRad(lon),
    y: R * Math.log(Math.tan(Math.PI / 4 + toRad(clamped) / 2)),
  };
}

function buildURL(base, layer, map, pointPx) {
  // BBOX exact depuis les coins écran (gestion rotation éventuelle OK côté WMS : bbox axis-aligned)
  const el = map.getCanvas();
  const w = Math.round(el.clientWidth);
  const h = Math.round(el.clientHeight);

  const tl = map.unproject([0, 0]);           // top-left
  const br = map.unproject([w, h]);           // bottom-right

  const tlm = lonLatTo3857(tl.lng, tl.lat);
  const brm = lonLatTo3857(br.lng, br.lat);

  const minx = Math.min(tlm.x, brm.x);
  const miny = Math.min(tlm.y, brm.y);
  const maxx = Math.max(tlm.x, brm.x);
  const maxy = Math.max(tlm.y, brm.y);
  const bbox = `${minx},${miny},${maxx},${maxy}`;

  const I = Math.round(pointPx.x);
  const J = Math.round(pointPx.y);

  const p = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetFeatureInfo",
    VERSION,
    LAYERS: layer,
    QUERY_LAYERS: layer,
    STYLES: "",
    FORMAT: IMAGE_FORMAT,
    INFO_FORMAT,
    CRS,
    BBOX: bbox,
    WIDTH: String(w),
    HEIGHT: String(h),
    I: String(I),
    J: String(J),
    FEATURE_COUNT: "5",
    FI_POINT_TOLERANCE: "5",
  });

  const qs = p.toString().replace(encodeURIComponent(bbox), bbox);
  return `${base}?${qs}`;
}

async function getAt(base, layer, map, pointPx, signal) {
  const url = buildURL(base, layer, map, pointPx);
  console.debug("[RRP] URL:", url);
  const resp = await fetch(url, { mode: "cors", signal });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error("[RRP] HTTP", resp.status, body);
    throw new Error(`WMS GetFeatureInfo ${resp.status}`);
  }
  // Affiche la structure brute pour debug si besoin
  const json = await resp.json();
  console.debug("[RRP] JSON keys:", Object.keys(json || {}));
  return json;
}

function pickProps(json) {
  // Supporte GeoJSON FeatureCollection (classique) et quelques variantes
  const features =
    json?.features ??
    (json?.type === "FeatureCollection" ? [] : []) ?? [];
  const props = features[0]?.properties ?? null;

  const proportions = props
    ? Object.fromEntries(
        Object.entries(props).filter(([k]) =>
          /pct|pourc|percent|prop|taux/i.test(k)
        )
      )
    : null;

  return { properties: props, proportions };
}

export async function getRrpAtPoint(map, pointPx, { signal } = {}) {
  // 1) Essai sur WMS vecteur (renvoie les attributs attendus pour INRA.CARTE.SOLS:geoportail_vf)
  let jsonV = null;
  try {
    jsonV = await getAt(WMS_V_BASE, LAYER_V, map, pointPx, signal);
    const outV = pickProps(jsonV);
    if (outV.properties) return outV;
  } catch (e) {
    if (e.name !== "AbortError") console.warn("[RRP] WMS-V fallback -> WMS-R");
  }

  // 2) Fallback raster
  const jsonR = await getAt(WMS_R_BASE, LAYER_R, map, pointPx, signal);
  const outR = pickProps(jsonR);
  return outR;
}
