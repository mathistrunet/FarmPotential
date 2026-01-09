const PARCELLES_ENDPOINT = "/api/parcelles";

const normalizeFeatureCollection = (payload) => {
  if (payload && payload.type === "FeatureCollection") {
    return payload;
  }
  return { type: "FeatureCollection", features: [] };
};

export async function fetchParcellesGeojson(signal) {
  const response = await fetch(PARCELLES_ENDPOINT, { signal });
  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }
  const data = await response.json();
  return normalizeFeatureCollection(data);
}

export async function saveParcellesGeojson(features, signal) {
  const collection = {
    type: "FeatureCollection",
    features: (features || []).map((feature) => ({
      type: "Feature",
      id: feature.id,
      geometry: feature.geometry,
      properties: feature.properties || {},
    })),
  };

  const response = await fetch(PARCELLES_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collection),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }

  return collection;
}
