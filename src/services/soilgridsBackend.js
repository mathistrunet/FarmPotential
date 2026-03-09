export async function fetchParcelSoilGrids(parcelId, { refresh = false, depthProfile, signal } = {}) {
  const params = new URLSearchParams();
  if (refresh) params.set("refresh", "true");
  if (Array.isArray(depthProfile) && depthProfile.length) {
    params.set("depth_profile", depthProfile.join(","));
  }
  const url = `/api/parcels/${encodeURIComponent(parcelId)}/soilgrids${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, { signal });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || "SoilGrids indisponible");
  }
  return payload;
}
