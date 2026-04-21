const SMALL_PARCEL_HA = 0.15;

function formatAreaAtTenth(areaHa) {
  if (!Number.isFinite(areaHa)) return null;
  return (Math.round(areaHa * 10) / 10).toFixed(1);
}

export function resolveToponymNames(assignments) {
  if (!Array.isArray(assignments) || !assignments.length) return new Map();

  const nameCount = new Map();
  assignments.forEach((entry) => {
    if (Number.isFinite(entry.areaHa) && entry.areaHa < SMALL_PARCEL_HA) return;
    nameCount.set(entry.baseName, (nameCount.get(entry.baseName) ?? 0) + 1);
  });

  const finalMap = new Map();
  assignments.forEach((entry) => {
    const areaHa = entry.areaHa;
    if (Number.isFinite(areaHa) && areaHa < SMALL_PARCEL_HA) {
      finalMap.set(entry.key, `${entry.baseName} bordure`);
      return;
    }
    const isDuplicate = (nameCount.get(entry.baseName) ?? 0) > 1;
    if (isDuplicate) {
      const area = formatAreaAtTenth(areaHa);
      const suffix = area ? ` ${area}` : "";
      finalMap.set(entry.key, `${entry.baseName}${suffix}`);
    } else {
      finalMap.set(entry.key, entry.baseName);
    }
  });

  return finalMap;
}
