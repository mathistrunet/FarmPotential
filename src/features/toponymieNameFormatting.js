const SMALL_PARCEL_HA = 0.15;

function formatAreaAtTenth(areaHa) {
  if (!Number.isFinite(areaHa)) return null;
  return (Math.round(areaHa * 10) / 10).toFixed(1);
}

export function resolveToponymNames(assignments) {
  if (!Array.isArray(assignments) || !assignments.length) return new Map();

  const grouped = new Map();
  assignments.forEach((entry) => {
    const areaHa = entry.areaHa;
    const isSmallParcel = Number.isFinite(areaHa) && areaHa < SMALL_PARCEL_HA;
    const name = isSmallParcel ? `${entry.baseName} bordure` : entry.baseName;
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(entry);
  });

  const finalMap = new Map();
  grouped.forEach((entries, name) => {
    if (entries.length === 1) {
      finalMap.set(entries[0].key, name);
      return;
    }
    entries.forEach((entry) => {
      const area = formatAreaAtTenth(entry.areaHa);
      const suffix = area ? ` ${area}` : "";
      finalMap.set(entry.key, `${name}${suffix}`);
    });
  });

  return finalMap;
}

