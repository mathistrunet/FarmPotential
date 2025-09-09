// src/services/rpg.js
// Appel WFS GEOPF (RPG) + utilitaires libellé culture

const WFS_BASE = "https://data.geopf.fr/wfs/ows";

export async function fetchRpgGeoJSON(year, bboxCRS84, count = 1000) {
  // bboxCRS84 = [minLon, minLat, maxLon, maxLat]
  const typeNames = `RPG.${year}:parcelles_graphiques`;
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames,
    srsName: "CRS:84",
    bbox: [...bboxCRS84, "CRS:84"].join(","),
    outputFormat: "application/json",
    count: String(count),
  });
  const url = `${WFS_BASE}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WFS HTTP ${res.status}`);
  return res.json();
}

// ——— DÉTECTION LIBELLÉ CULTURE ———
const DIRECT_LABEL_KEYS = [
  "LIB_CULTURE","LIB_CULTU","LIBELLE_CULTURE","NOM_CULTURE","LIB_LONG","LIBELLE",
  "CULTURE","culture","CULT_NOM","CULT_LIB","INTITULE","INTITULE_CULTURE"
];
const CODE_KEYS = [
  "CODE_CULTURE","CODE_CULTU","CULT_CODE","CODE","CODE_CULT","CODE_CULTUR",
  "CULTURE_CODE","CD_CULT","CULT","code_culture","code_cult"
];


export function getCultureLabel(props={}) {
  // 1) libellé direct
  for (const k of DIRECT_LABEL_KEYS) {
    const v = props[k];
    if (v != null && String(v).trim() !== "") return { label: String(v).trim(), code: null };
  }
  // 2) code détecté
  let code = null;
  for (const k of CODE_KEYS) {
    const v = props[k];
    if (v != null && String(v).trim() !== "") { code = String(v).trim(); break; }
  }
  if (!code) {
    // heuristique
    for (const [k,v] of Object.entries(props)) {
      if (v==null) continue;
      if (/code.*cult|cult.*code|^code_.*cult/i.test(k) || /cult/i.test(k)) {
        const val = String(v).trim();
        if (/^[A-Z0-9]{2,6}$/.test(val)) { code = val; break; }
      }
    }
  }
  const map = { ...(window.CODEBOOK_EXTRA || {}) };
  return { label: code ? (map[code] || `Code : ${code}`) : "(culture inconnue)", code };
}

// Utilitaire simple
export function getMapBoundsCRS84(map) {
  const b = map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}
