export async function fetchParcelSoilGrids(parcelId, { refresh = false, depthProfile, signal } = {}) {
  const params = new URLSearchParams();
  if (refresh) params.set("refresh", "true");
  if (Array.isArray(depthProfile) && depthProfile.length) {
    params.set("depth_profile", depthProfile.join(","));
  }
  const url = `/api/parcels/${encodeURIComponent(parcelId)}/soilgrids${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    let message = "SoilGrids indisponible";
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch (_) { /* réponse non-JSON (ex. 502 HTML) */ }
    throw new Error(message);
  }
  return response.json();
}
