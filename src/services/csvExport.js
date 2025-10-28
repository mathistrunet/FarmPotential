// src/services/csvExport.js
import { displayLabelFromProps, labelFromCode } from "../utils/cultureLabels";

const CSV_COLUMNS = [
  "Secteur",
  "Exploitation",
  "Code exploitation",
  "Parcelle",
  "CultureN",
];

function csvEscape(value) {
  if (value == null) return "";
  const str = String(value);
  if (/[";\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function computeParcelleLabel(props = {}, fallbackIndex = 0) {
  const ilot = (props.ilot_numero ?? "").toString().trim();
  const numero = (props.numero ?? "").toString().trim();
  if (ilot && numero) return `${ilot}.${numero}`;

  const nomAffiche = (props.nom_affiche ?? props.nom ?? props.name ?? "").toString().trim();
  if (nomAffiche) return nomAffiche;

  if (ilot) return ilot;
  if (numero) return numero;

  return `Parcelle ${fallbackIndex + 1}`;
}

function computeCultureLabel(props = {}) {
  const directCode = (props.code ?? props.code_culture ?? props.CODE_CULTURE ?? "").toString().trim();
  if (directCode) {
    const fromCode = labelFromCode(directCode);
    if (fromCode) return fromCode;
  }

  const display = displayLabelFromProps(props);
  if (display && display !== "(inconnu)") return display;

  if (directCode) return directCode;
  return "";
}

export function buildParcellesCsv(features = [], metadata = {}) {
  const {
    secteur = "",
    exploitation = "",
    codeExploitation = "",
  } = metadata;

  const rows = [CSV_COLUMNS];

  features
    .filter((f) => {
      const type = f?.geometry?.type;
      return type === "Polygon" || type === "MultiPolygon";
    })
    .forEach((feature, index) => {
      const props = feature?.properties || {};
      const parcelle = computeParcelleLabel(props, index);
      const culture = computeCultureLabel(props);

      rows.push([
        secteur,
        exploitation,
        codeExploitation,
        parcelle,
        culture,
      ]);
    });

  return rows.map((row) => row.map(csvEscape).join(";")).join("\r\n");
}

