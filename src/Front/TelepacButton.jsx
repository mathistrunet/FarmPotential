// src/Front/TelepacButton.jsx
import React, { useRef, useState } from "react";
import { parseTelepacXmlToFeatures, buildTelepacXML } from "../services/telepacXml";
import { parseShapefileZipToFeatures } from "../services/shapefileZip";
import { parseParcellesCsvToFeatures } from "../services/parcellesCsv";
import { buildParcelShapefileZip } from "../services/parcelleShapefile";
import { resolveOverlappingParcelsAsync } from "../utils/overlapResolution";

/** Icônes légères inline (gardées) */
const iconStyle = { width: 18, height: 18, display: "inline-block", verticalAlign: "-3px" };
const IconUpload = () => (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M12 3l4 4h-3v6h-2V7H8l4-4zM5 18h14v2H5v-2z" fill="currentColor" />
  </svg>
);
const IconDownload = () => (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M11 5h2v8h3l-4 4-4-4h3V5zM5 19h14v2H5v-2z" fill="currentColor" />
  </svg>
);

function extractYearFromFilename(name) {
  const matches = String(name || "").match(/(?:19|20)\d{2}/g);
  if (!matches?.length) return null;
  const year = Number.parseInt(matches[0], 10);
  if (!Number.isFinite(year) || year < 1990 || year > 2100) return null;
  return year;
}

function parseYearInput(value) {
  if (value == null) return null;
  const year = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(year) || year < 1990 || year > 2100) return null;
  return year;
}

function _resolveCsvYear(file) {
  const detected = extractYearFromFilename(file?.name || "");
  if (detected != null) {
    const confirmed = window.confirm(
      `Le fichier "${file.name}" correspond-il à l'année ${detected} ?`
    );
    if (confirmed) return detected;
  }
  const input = window.prompt(
    "Indique l'année du fichier importé (ex: 2023)."
  );
  return parseYearInput(input);
}

function _resolveXmlYear(file, metaYear) {
  if (Number.isFinite(metaYear)) return metaYear;
  const detected = extractYearFromFilename(file?.name || "");
  if (detected != null) return detected;
  const lastModified =
    file?.lastModified != null ? new Date(file.lastModified) : null;
  const lastModifiedYear = lastModified ? lastModified.getFullYear() : null;
  if (Number.isFinite(lastModifiedYear)) return lastModifiedYear;
  return new Date().getFullYear();
}

function detectTelepacMeta(text) {
  const pacageMatch = text.match(/numero-pacage="([^"]+)"/i);
  const pacage = pacageMatch?.[1]?.trim() || null;
  const campaignMatch = text.match(/campagne="([^"]+)"/i);
  const campaign = campaignMatch?.[1]?.trim() || null;
  const yearMatch = text.match(/fichier-xsd="[^"]*?((?:19|20)\d{2})[^"]*"/i);
  const year = yearMatch ? Number.parseInt(yearMatch[1], 10) : null;
  return {
    pacage,
    campaign: campaign ? campaign.toLowerCase() : null,
    year: Number.isFinite(year) ? year : null,
  };
}

function parseCultureColumnInput(value) {
  if (value == null) return null;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return null;
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (trimmed === "n+1" || trimmed === "+1") return -1;
  if (trimmed.startsWith("culturen")) {
    const suffix = trimmed.replace(/^culturen[_-]?/, "");
    if (!suffix) return 0;
    if (/^\d+$/.test(suffix)) return Number.parseInt(suffix, 10);
    if (suffix === "+1" || suffix === "plus1") return -1;
  }
  return null;
}

function cultureColumnFromOffset(offset) {
  if (!Number.isFinite(offset)) return "cultureN";
  if (offset === -1) return "cultureN_plus1";
  if (offset < 0) return "cultureN";
  return offset === 0 ? "cultureN" : `cultureN${offset}`;
}

function resolveCultureValue(props = {}) {
  const candidates = [
    props.cultureN,
    props.culture,
    props.code_culture,
    props.code,
  ];
  const value = candidates.find((item) => item != null && String(item).trim() !== "");
  return value == null ? "" : String(value).trim();
}

function applyXmlImportContext(features, { year, cultureOffset }) {
  return (features || []).map((feature) => {
    const props = { ...(feature?.properties || {}) };

    if (Number.isFinite(year)) {
      props.annee = year;
    }

    const cultureValue = resolveCultureValue(props);
    if (cultureValue) {
      const targetColumn = cultureColumnFromOffset(cultureOffset);
      delete props.culture;
      delete props.cultureN;
      delete props.cultureN_0;
      delete props.cultureN0;
      // Pour offset != 0, supprimer aussi code/code_culture : ces champs sont
      // reconnus comme alias de culture courante (PROPERTY_ALIASES.culture) et
      // provoqueraient une duplication dans la colonne N.
      if (cultureOffset !== 0) {
        delete props.code;
        delete props.code_culture;
      }
      props[targetColumn] = cultureValue;
      if (cultureOffset === 0) {
        props.culture = cultureValue;
      }
    }

    return {
      ...feature,
      properties: props,
    };
  });
}

async function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsText(file, "ISO-8859-1");
  });
}

async function _resolveTelepacCultureOffset(file, baseCultureYearRef) {
  const text = await readFileText(file);
  const { campaign, year, pacage } = detectTelepacMeta(text);

  let baseYear = baseCultureYearRef.current;

  if (year != null) {
    if (baseYear == null || year > baseYear) {
      baseYear = year;
      baseCultureYearRef.current = baseYear;
    }
  } else if (baseYear == null && campaign) {
    // Last fallback when year cannot be parsed from fichier-xsd.
    const fallbackYear = new Date().getFullYear();
    baseYear = fallbackYear;
    baseCultureYearRef.current = fallbackYear;
  }

  if (year != null && baseYear != null) {
    const offset = baseYear - year;
    if (offset >= -1 && offset <= 6) return { offset, meta: { pacage, year } };
  }

  return { offset: null, meta: { pacage, year } };
}

const COLUMN_OPTIONS = [
  { offset: -1, label: "N+1 — Culture de l'année suivante" },
  { offset: 0,  label: "N — Culture courante" },
  { offset: 1,  label: "N-1 — Culture précédente" },
  { offset: 2,  label: "N-2" },
  { offset: 3,  label: "N-3" },
  { offset: 4,  label: "N-4" },
  { offset: 5,  label: "N-5" },
  { offset: 6,  label: "N-6" },
];

function ColumnSelectDialog({ suggestedOffset, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(suggestedOffset ?? 0);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, padding: 24, width: 360,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Colonne de destination</h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "#475569" }}>
          Choisissez dans quelle colonne les cultures de ce fichier XML seront importées.
        </p>
        <select
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}
        >
          {COLUMN_OPTIONS.map((col) => (
            <option key={col.offset} value={col.offset}>{col.label}</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer" }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 600 }}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}


export default function ImportTelepacButton({
  mapRef,
  drawRef,
  setFeatures,
  selectFeatureOnMap,
  compact = false,
  buttonStyle,
  disabled = false,
  fileAccept = ".xml,.zip,.csv",
  // mode = "append", Si on veut réactiver la fonction replace à l'import d'un parcellaire
  zoomOnImport = true,
  labelImport,
  onImported,
  onImportMeta,
  onError,
}) {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [columnDialog, setColumnDialog] = useState(null);
  const columnDialogResolveRef = useRef(null);
  const _baseCultureYearRef = useRef(null);

  const askForColumn = (suggestedOffset) =>
    new Promise((resolve) => {
      columnDialogResolveRef.current = resolve;
      setColumnDialog({ suggestedOffset });
    });

  const handleColumnConfirm = (offset) => {
    setColumnDialog(null);
    columnDialogResolveRef.current?.(offset);
    columnDialogResolveRef.current = null;
  };

  const handleColumnCancel = () => {
    setColumnDialog(null);
    columnDialogResolveRef.current?.(null);
    columnDialogResolveRef.current = null;
  };

  const btnDefault = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: compact ? "6px 8px" : "8px 12px",
    borderRadius: 8,
    background: "#fff",
    border: "1px solid #d1d5db",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled || loading ? 0.6 : 1,
    fontSize: 14,
  };
  const btn = { ...btnDefault, ...(buttonStyle || {}) };

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      let feats;
      const name = file.name?.toLowerCase() ?? "";
      if (name.endsWith(".zip")) {
        feats = await parseShapefileZipToFeatures(file);
      } else if (name.endsWith(".csv")) {
        feats = await parseParcellesCsvToFeatures(file);
      } else if (name.endsWith(".xml")) {
        const xmlContext = await _resolveTelepacCultureOffset(file, _baseCultureYearRef);
        const xmlYear = _resolveXmlYear(file, xmlContext?.meta?.year);

        const suggestedOffset = Number.isFinite(xmlContext?.offset) ? xmlContext.offset : 0;
        setLoading(false);
        const chosenOffset = await askForColumn(suggestedOffset);
        setLoading(true);
        if (chosenOffset === null) return;
        const cultureOffset = chosenOffset;

        feats = applyXmlImportContext(await parseTelepacXmlToFeatures(file), {
          year: xmlYear,
          cultureOffset,
        });
      } else {
        throw new Error("FORMAT_INVALIDE");
      }
      if (!feats || feats.length === 0) {
        throw new Error("IMPORT_VIDE");
      }
      const draw = drawRef?.current,
        map = mapRef?.current;
      if (!draw || !map) return;

      // // Nettoyage si mode replace
      // if (mode === "replace") {
      //   const ids = (draw.getAll()?.features ?? []).map((f) => f.id).filter(Boolean);
      //   if (ids.length) draw.delete(ids);
      // }

      // Ajout des features
      // (on peut ajouter un FeatureCollection d’un coup mais on garde l’itératif robuste)
      for (const ft of feats) draw.add(ft);

      void resolveOverlappingParcelsAsync(draw, { mode: "warn" });

      // Zoom sur l’emprise (MultiPolygon pris en charge)
      const importedFeatures = draw.getAll()?.features ?? [];
      if (zoomOnImport && importedFeatures.length) {
        let minLon = Infinity,
          minLat = Infinity,
          maxLon = -Infinity,
          maxLat = -Infinity;
        for (const f of importedFeatures) {
          const t = f.geometry?.type;
          const coords =
            t === "Polygon"
              ? f.geometry.coordinates.flat(1)
              : t === "MultiPolygon"
              ? f.geometry.coordinates.flat(2)
              : [];
          for (const [lon, lat] of coords) {
            if (lon < minLon) minLon = lon;
            if (lat < minLat) minLat = lat;
            if (lon > maxLon) maxLon = lon;
            if (lat > maxLat) maxLat = lat;
          }
        }
        if (minLon < Infinity) {
          try {
            map.fitBounds(
              [
                [minLon, minLat],
                [maxLon, maxLat],
              ],
              { padding: 40 }
            );
          } catch {
            /* ignore fitBounds errors */
          }
        }
      }

      // Synchronise la liste et sélectionne la 1ʳᵉ
      const arr = draw.getAll()?.features ?? [];
      const polys = arr.filter(
        (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
      );
      setFeatures?.(polys);
      if (arr[0]?.id && typeof selectFeatureOnMap === "function") {
        selectFeatureOnMap(arr[0].id, false);
      }

      onImportMeta?.({
        pacage: feats?.[0]?.properties?.code_exploitation || feats?.[0]?.properties?.pacage || null,
        year: Number.isFinite(Number(feats?.[0]?.properties?.annee))
          ? Number(feats?.[0]?.properties?.annee)
          : null,
      });
      onImported?.(feats);
    } catch (err) {
      console.error(err);
      onError?.(err);
      alert(
        "Impossible de lire ce fichier. Utilise un export Télépac (.xml), un shapefile zippé (.zip) ou un fichier CSV (.csv)."
      );
    } finally {
      setLoading(false);
      // Permet de ré-importer le même fichier juste après
      e.target.value = "";
    }
  }

  return (
    <>
      <button
        onClick={() => !disabled && !loading && fileInputRef.current?.click()}
        style={btn}
        title="Importer un XML Télépac, un shapefile zippé ou un CSV"
        disabled={disabled || loading}
      >
        <IconUpload />{" "}
        {compact ? null : (
          <span>{labelImport || (loading ? "Import..." : "Importer fichier")}</span>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={fileAccept}
        onChange={onPickFile}
        style={{ display: "none" }}
      />
      {columnDialog && (
        <ColumnSelectDialog
          suggestedOffset={columnDialog.suggestedOffset}
          onConfirm={handleColumnConfirm}
          onCancel={handleColumnCancel}
        />
      )}
    </>
  );
}

/**
 * Bouton d’export Télépac (XML)
 *
 * Props :
 * - features: Feature[]
 * - compact?: boolean
 * - buttonStyle?: object
 * - disabled?: boolean
 * - labelExport?: string
 * - filenamePrefix?: string (defaut: "telepac_export_")
 * - onError?: (err) => void
 */
export function ExportTelepacButton({
  features = [],
  compact = false,
  buttonStyle,
  disabled = false,
  labelExport,
  filenamePrefix = "telepac_export_",
  onError,
}) {
  const [loading, setLoading] = useState(false);

  const btnDefault = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: compact ? "6px 8px" : "8px 12px",
    borderRadius: 8,
    background: "#111",
    color: "#fff",
    border: "none",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled || loading ? 0.7 : 1,
    fontSize: 14,
  };
  const btn = { ...btnDefault, ...(buttonStyle || {}) };

  function exportXML() {
    if (!features.length) {
      alert("Dessine ou importe au moins une parcelle.");
      return;
    }
    setLoading(true);
    try {
      const xml = buildTelepacXML(features);
      const blob = new Blob([xml], { type: "application/xml;charset=UTF-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenamePrefix}${Date.now()}.xml`;
      a.click();
      URL.revokeObjectURL(url); // hygiène mémoire
    } catch (err) {
      console.error(err);
      onError?.(err);
      alert("Échec de l’export Télépac.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={exportXML}
      style={btn}
      title="Exporter en XML Télépac"
      disabled={disabled || loading}
    >
      <IconDownload />{" "}
      {compact ? null : <span>{labelExport || (loading ? "Export..." : "Exporter XML")}</span>}
    </button>
  );
}

export function ExportShapefileButton({
  features = [],
  setFeatures,
  compact = false,
  buttonStyle,
  disabled = false,
  labelExport,
  filenamePrefix = "parcellaire_",
  onError,
}) {
  const [loading, setLoading] = useState(false);

  const btnDefault = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: compact ? "6px 8px" : "8px 12px",
    borderRadius: 8,
    background: "#15803d",
    color: "#fff",
    border: "none",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled || loading ? 0.7 : 1,
    fontSize: 14,
  };
  const btn = { ...btnDefault, ...(buttonStyle || {}) };

  async function exportShapefile() {
    if (!features.length) {
      alert("Dessine ou importe au moins une parcelle.");
      return;
    }

    const firstProps = features[0]?.properties || {};
    const defaultName = (firstProps.RAIS_SOCIA || firstProps.rais_soc || "").toString();
    const exploitationName = window.prompt(
      "Nom de l'exploitation (sera exporté en majuscules)",
      defaultName.toUpperCase()
    );
    if (exploitationName == null) return;
    const trimmedName = exploitationName.trim();
    if (!trimmedName) {
      alert("Le nom de l'exploitation est obligatoire pour l'export shapefile.");
      return;
    }

    const defaultYear = (firstProps.CAMPAGNE || new Date().getFullYear()).toString();
    const campagneInput = window.prompt("Campagne (année)", defaultYear);
    const campagneValue = (campagneInput == null ? defaultYear : campagneInput).trim() || defaultYear;

    setLoading(true);
    try {
      const { blob, updatedFeatures } = await buildParcelShapefileZip(features, {
        raisSoc: trimmedName,
        campagne: campagneValue,
      });
      if (typeof setFeatures === "function") {
        setFeatures(updatedFeatures);
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenamePrefix}${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      onError?.(err);
      if (err?.message === "RAIS_SOCIA_REQUIRED") {
        alert("Renseigne un nom d'exploitation pour l'export shapefile.");
      } else {
        alert("Échec de l'export shapefile.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={exportShapefile}
      style={btn}
      title="Exporter les parcelles en shapefile (.zip)"
      disabled={disabled || loading}
    >
      <IconDownload />{" "}
      {compact ? null : (
        <span>{labelExport || (loading ? "Export..." : "Exporter SHP")}</span>
      )}
    </button>
  );
}

