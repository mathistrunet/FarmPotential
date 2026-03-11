const regionCache = new Map();

function normalizeRegion(code) {
  if (!code) return null;
  return code.toUpperCase();
}

function bboxKey(bbox) {
  return bbox.map((value) => Number(value).toFixed(4)).join(":");
}

export async function getToponymiePoints(regionCode, bbox, signal) {
  const normalized = normalizeRegion(regionCode);
  if (!normalized || !Array.isArray(bbox) || bbox.length !== 4) {
    return [];
  }

  const cacheKey = `${normalized}:${bboxKey(bbox)}`;
  if (regionCache.has(cacheKey)) {
    return regionCache.get(cacheKey);
  }

  const query = new URLSearchParams({
    region: normalized,
    bbox: bbox.join(","),
    limit: "15000",
  });

  const promise = fetch(`/api/toponymie/points?${query.toString()}`, { signal })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    })
    .then((payload) => {
      const points = Array.isArray(payload?.points) ? payload.points : [];
      return points.filter(
        (point) => Array.isArray(point?.coordinates) && point.coordinates.length >= 2
      );
    })
    .catch((error) => {
      regionCache.delete(cacheKey);
      throw error;
    });

  regionCache.set(cacheKey, promise);
  return promise;
}
