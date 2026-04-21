// Lightweight structural equality for GeoJSON FeatureCollections.
// Uses reference check on geometry (same object = unchanged) to avoid
// serializing large coordinate arrays when only properties changed.
export function featureCollectionsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const af = a.features;
  const bf = b.features;
  if (!Array.isArray(af) || !Array.isArray(bf)) return false;
  if (af.length !== bf.length) return false;
  for (let i = 0; i < af.length; i++) {
    const fa = af[i];
    const fb = bf[i];
    if (fa === fb) continue;
    if (fa.id !== fb.id) return false;
    if (
      fa.geometry !== fb.geometry &&
      JSON.stringify(fa.geometry) !== JSON.stringify(fb.geometry)
    )
      return false;
    if (
      fa.properties !== fb.properties &&
      JSON.stringify(fa.properties) !== JSON.stringify(fb.properties)
    )
      return false;
  }
  return true;
}
