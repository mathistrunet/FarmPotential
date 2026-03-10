import { withBasePath } from "../utils/publicBase";
import { labelFromCode } from "../utils/cultureLabels";

const PRECISIONS_PATH = withBasePath("/data/pac_2024_precisions.json");
let precisionsPromise;

const normalizeLabel = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const PRECISION_REPLACEMENTS = new Map([
  ["recolte en grains", "grain"],
  ["recolte en grain", "grain"],
  ["recolte plante", "plante entiere"],
  ["recolte plante entiere", "plante entiere"],
  ["recolte ensilage", "ensilage"],
  ["recolte en vert", "vert"],
  ["recolte en fourrage", "fourrage"],
]);

const STANDALONE_PRECISION_LABELS = new Set(["oignon", "echalote", "echalotte"]);

export async function loadPacPrecisions() {
  if (!precisionsPromise) {
    precisionsPromise = fetch(PRECISIONS_PATH)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Chargement des precisions PAC 2024 impossible.");
        }
        return response.json();
      })
      .catch((error) => {
        console.warn("[PAC_PRECISIONS]", error);
        return {};
      });
  }
  return precisionsPromise;
}

function formatPrecisionLabelForDisplay(label) {
  if (!label) return "";
  const normalized = normalizeLabel(label);
  const replaced = PRECISION_REPLACEMENTS.get(normalized);
  if (replaced) {
    return replaced;
  }
  return String(label).trim();
}

export function getPrecisionLabel(precisionsMap, code, precisionCode) {
  if (!precisionsMap || !code || !precisionCode) return "";
  const list = precisionsMap[code] || [];
  const match = list.find((entry) => String(entry.code) === String(precisionCode));
  return match ? formatPrecisionLabelForDisplay(match.label) : "";
}

export function buildCultureDisplayLabel(code, precisionLabel) {
  const baseLabel = labelFromCode(String(code || "").toUpperCase()) || String(code || "");
  if (!precisionLabel) return baseLabel;
  const formattedPrecision = formatPrecisionLabelForDisplay(precisionLabel);
  const normalizedPrecision = normalizeLabel(formattedPrecision);
  const normalizedBase = normalizeLabel(baseLabel);
  if (normalizedPrecision && normalizedPrecision.includes(normalizedBase)) {
    return formattedPrecision;
  }
  if (STANDALONE_PRECISION_LABELS.has(normalizedPrecision)) {
    return formattedPrecision;
  }
  return `${baseLabel} ${formattedPrecision}`.trim();
}

export function buildPrecisionOptions(precisionsMap, code) {
  const list = precisionsMap?.[code] || [];
  return list.map((entry) => ({ code: entry.code, label: formatPrecisionLabelForDisplay(entry.label) }));
}
