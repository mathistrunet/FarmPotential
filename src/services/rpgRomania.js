// src/services/rpgRomania.js
// Récupère les parcelles du RPG Roumanie servies par le backend local
// (lecture sur disque du GeoPackage volumineux via l'endpoint /api/rpg-romania).

export const RPG_RO_MAX_FEATURES = 1000;

export async function fetchRpgRomaniaGeoJSON(bboxCRS84, { signal, limit = RPG_RO_MAX_FEATURES } = {}) {
  // bboxCRS84 = [minLon, minLat, maxLon, maxLat]
  const query = new URLSearchParams({
    bbox: bboxCRS84.join(","),
    limit: String(limit),
  });
  const res = await fetch(`/api/rpg-romania?${query.toString()}`, { signal });
  if (!res.ok) throw new Error(`RPG Romania HTTP ${res.status}`);
  const payload = await res.json();
  return payload?.collection || { type: "FeatureCollection", features: [] };
}

// Identifiant parcellaire (seule information disponible dans cette couche).
export function getRpgRomaniaId(props = {}) {
  const raw = props.fbid ?? props.FBID ?? props.fid ?? props.id;
  return raw != null && String(raw).trim() !== "" ? String(raw).trim() : null;
}
