const SOIL_TYPE_CSV_PATH = "/data/Soil_type_RRP.csv";
const SOIL_MAPPING_ENDPOINT = "/api/soil-type-mappings";

let soilRowsPromise;

function parseSemicolonCsv(text) {
  const lines = String(text || "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(";");
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || "").trim();
    });
    return row;
  });
}

function norm(v) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s || /^na$/i.test(s)) return "";
  return s;
}

export function buildSoilCombinationLabel(row) {
  const texture = norm(row.texture);
  const profondeur = norm(row.profondeur);
  const cailloux = norm(row.cailloux);
  const hydromorphie = norm(row.hydromorphie);
  const positionTopo = norm(row.position_topo);
  const phClasse = norm(row.ph_classe);

  const firstParts = [texture, profondeur, cailloux].filter(Boolean);
  const first = firstParts.join(" ") || "Type de sol non renseigné";
  const hydro = hydromorphie ? `de ${hydromorphie}` : "";
  const topo = positionTopo ? `${hydro ? " " : ""}sur ${positionTopo}` : "";
  const ph = phClasse ? `${hydro || topo ? " " : ""}à tendance ${phClasse.toLowerCase()}` : "";
  return `${first}${hydro ? ` ${hydro}` : ""}${topo}${ph}`.replace(/\s+/g, " ").trim();
}

export async function loadSoilTypeRows() {
  if (!soilRowsPromise) {
    soilRowsPromise = fetch(SOIL_TYPE_CSV_PATH)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      })
      .then((text) => {
        const rows = parseSemicolonCsv(text);
        return rows.map((row) => ({
          ...row,
          source_file: norm(row.source_file),
          combination_label: buildSoilCombinationLabel(row),
        }));
      });
  }
  return soilRowsPromise;
}

export async function loadSoilTypeLookupBySourceFile() {
  const rows = await loadSoilTypeRows();
  const lookup = new Map();
  rows.forEach((row) => {
    const key = norm(row.source_file).toLowerCase();
    if (!key || lookup.has(key)) return;
    lookup.set(key, row);
  });
  return lookup;
}

export async function fetchSoilTypeMappings(signal) {
  const response = await fetch(SOIL_MAPPING_ENDPOINT, { signal });
  if (!response.ok) {
    throw new Error(`[SOIL_MAPPING_FETCH_${response.status}] Impossible de charger les mappings.`);
  }
  return response.json();
}

export async function saveSoilTypeMappings(mappings, signal) {
  const response = await fetch(SOIL_MAPPING_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mappings }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`[SOIL_MAPPING_SAVE_${response.status}] Impossible d'enregistrer les mappings.`);
  }
  return response.json();
}

export function resolveFileUcs(properties) {
  if (!properties || typeof properties !== "object") return "";
  const keys = ["file_ucs", "FILE_UCS", "source_file", "SOURCE_FILE", "id_ucs_file"];
  for (const key of keys) {
    if (properties[key] != null && String(properties[key]).trim()) return String(properties[key]).trim();
  }
  return "";
}
