// src/Front/TelepacButton.jsx
import React, { useRef, useState } from "react";
import { parseTelepacXmlToFeatures, buildTelepacXML } from "../services/telepacXml";
import { parseParcellesCsvToFeatures } from "../services/parcellesCsv";
import { featureAreaM2 } from "../utils/geometry";
import {
  intersectionArea,
  resolveOverlappingParcels,
  updateDrawFeatureProperties,
} from "../utils/overlapResolution";

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

function resolveCsvYear(file) {
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

function detectTelepacMeta(text) {
  const campaignMatch = text.match(/campagne="([^"]+)"/i);
  const campaign = campaignMatch?.[1]?.trim() || null;
  const yearMatch = text.match(/fichier-xsd="[^"]*?((?:19|20)\d{2})[^"]*"/i);
  const year = yearMatch ? Number.parseInt(yearMatch[1], 10) : null;
  return {
    campaign: campaign ? campaign.toLowerCase() : null,
    year: Number.isFinite(year) ? year : null,
  };
}

function parseCultureColumnInput(value) {
  if (value == null) return null;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (trimmed.startsWith("culturen")) {
    const suffix = trimmed.replace(/^culturen[_-]?/, "");
    if (!suffix) return 0;
    if (/^\d+$/.test(suffix)) return Number.parseInt(suffix, 10);
  }
  return null;
}

async function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsText(file, "ISO-8859-1");
  });
}

async function resolveTelepacCultureOffset(file, baseCultureYearRef) {
  const text = await readFileText(file);
  const { campaign, year } = detectTelepacMeta(text);

  let baseYear = baseCultureYearRef.current;
  if (baseYear == null && year != null) {
    if (campaign === "courante") baseYear = year;
    if (campaign === "precedente") baseYear = year + 1;
    if (baseYear != null) baseCultureYearRef.current = baseYear;
  }

  if (year != null && baseYear != null) {
    const offset = baseYear - year;
    if (offset >= 0 && offset <= 6) return offset;
  }

  const input = window.prompt(
    "Impossible de déterminer automatiquement la colonne des cultures. " +
      "Indique la colonne cible (cultureN, cultureN1, cultureN2...) ou un numéro."
  );
  const parsed = parseCultureColumnInput(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function filterMergeProps(props) {
  return Object.fromEntries(
    Object.entries(props || {}).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
}

function mergeProperties(props) {
  return filterMergeProps(props);
}

function getFeatureLabel(feature, index) {
  const props = feature?.properties || {};
  const label = props.nom_affiche || props.numero || props.id || null;
  if (label != null && String(label).trim() !== "") return String(label);
  return `Parcelle ${index + 1}`;
}

function mergeTelepacFeatures(draw, incomingFeatures) {
  const existing = draw.getAll()?.features ?? [];
  if (!existing.length) {
    return { toAdd: incomingFeatures, didMerge: false, mismatches: [] };
  }

  const similarityThreshold = 0.95;
  const existingEntries = existing.map((feature, index) => ({
    feature,
    id: feature.id ?? `existing-${index}`,
    hasId: feature.id != null,
    area: featureAreaM2(feature) ?? 0,
  }));
  const incomingEntries = incomingFeatures.map((feature, index) => ({
    feature,
    index,
    area: featureAreaM2(feature) ?? 0,
  }));

  const overlapsByIncoming = incomingEntries.map(() => []);
  const overlapsByExisting = existingEntries.map(() => []);
  incomingEntries.forEach((incomingEntry, incomingIndex) => {
    existingEntries.forEach((existingEntry, existingIndex) => {
      const interArea = intersectionArea(existingEntry.feature, incomingEntry.feature);
      if (interArea <= 0) return;
      const maxArea = Math.max(existingEntry.area, incomingEntry.area, 1);
      const similarity = interArea / maxArea;
      overlapsByIncoming[incomingIndex].push({
        existingIndex,
        interArea,
        similarity,
      });
      overlapsByExisting[existingIndex].push({
        incomingIndex,
        interArea,
      });
    });
  });

  const toAdd = [];
  const matchedExistingIds = new Set();
  const existingToRemove = new Set();
  const mismatches = [];
  const mismatchIncomingIndexes = new Map();

  overlapsByIncoming.forEach((overlaps, incomingIndex) => {
    if (overlaps.length) {
      const maxSimilarity = Math.max(...overlaps.map((item) => item.similarity));
      if (maxSimilarity < similarityThreshold) {
        mismatches.push({
          label: getFeatureLabel(incomingEntries[incomingIndex]?.feature, incomingIndex),
          maxSimilarity,
        });
        mismatchIncomingIndexes.set(incomingIndex, maxSimilarity);
      }
    }
    overlaps.forEach(({ existingIndex, similarity }) => {
      if (similarity < similarityThreshold) return;
      const existingEntry = existingEntries[existingIndex];
      if (!existingEntry) return;
      matchedExistingIds.add(existingEntry.id);
      updateDrawFeatureProperties(
        draw,
        existingEntry.feature,
        mergeProperties(incomingEntries[incomingIndex].feature.properties || {})
      );
    });
  });

  const splitExistingIds = new Set();
  overlapsByExisting.forEach((overlaps, existingIndex) => {
    if (overlaps.length < 2) return;
    const existingEntry = existingEntries[existingIndex];
    if (!existingEntry || existingEntry.area <= 0) return;
    const totalIntersection = overlaps.reduce((sum, item) => sum + item.interArea, 0);
    if (totalIntersection / existingEntry.area >= similarityThreshold) {
      splitExistingIds.add(existingEntry.id);
    }
  });

  incomingEntries.forEach((incomingEntry, incomingIndex) => {
    const overlaps = overlapsByIncoming[incomingIndex];
    const hasSimilarityMatch = overlaps.some(
      ({ existingIndex, similarity }) =>
        similarity >= similarityThreshold &&
        matchedExistingIds.has(existingEntries[existingIndex]?.id)
    );
    if (hasSimilarityMatch) return;
    if (mismatchIncomingIndexes.has(incomingIndex)) {
      const mismatchSimilarity = mismatchIncomingIndexes.get(incomingIndex);
      toAdd.push({
        ...incomingEntry.feature,
        properties: {
          ...(incomingEntry.feature.properties || {}),
          import_mismatch: true,
          import_mismatch_similarity: mismatchSimilarity,
        },
      });
      return;
    }

    const splitOverlap = overlaps
      .map(({ existingIndex, interArea }) => ({
        existingEntry: existingEntries[existingIndex],
        interArea,
      }))
      .filter(
        ({ existingEntry }) =>
          existingEntry && splitExistingIds.has(existingEntry.id)
      )
      .sort((a, b) => b.interArea - a.interArea)[0];

    if (splitOverlap?.existingEntry) {
      const mergedProps = {
        ...(splitOverlap.existingEntry.feature.properties || {}),
        ...filterMergeProps(incomingEntry.feature.properties || {}),
      };
      toAdd.push({
        ...incomingEntry.feature,
        properties: mergedProps,
      });
      existingToRemove.add(splitOverlap.existingEntry.id);
      return;
    }

    const overlappingExisting = overlaps
      .map(({ existingIndex }) => existingEntries[existingIndex])
      .filter((entry) => entry && !matchedExistingIds.has(entry.id));
    if (overlappingExisting.length) {
      overlappingExisting.forEach((entry) => existingToRemove.add(entry.id));
      toAdd.push(incomingEntry.feature);
      return;
    }

    toAdd.push(incomingEntry.feature);
  });

  existingEntries.forEach((entry) => {
    if (!entry.hasId) return;
    if (existingToRemove.has(entry.id) && !matchedExistingIds.has(entry.id)) {
      draw.delete(entry.id);
    }
  });

  return { toAdd, didMerge: true, mismatches };
}


export default function ImportTelepacButton({
  mapRef,
  drawRef,
  setFeatures,
  selectFeatureOnMap,
  compact = false,
  buttonStyle,
  disabled = false,
  fileAccept = ".xml,.csv",
  // mode = "append", Si on veut réactiver la fonction replace à l'import d'un parcellaire
  zoomOnImport = true,
  labelImport,
  onImported,
  onError,
}) {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const baseCultureYearRef = useRef(null);

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
      const isCsv =
        file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");
      let cultureYearOffset = 0;
      if (!isCsv) {
        const detectedOffset = await resolveTelepacCultureOffset(
          file,
          baseCultureYearRef
        );
        if (!Number.isFinite(detectedOffset)) {
          alert(
            "Colonne de cultures invalide. Import Télépac annulé."
          );
          return;
        }
        cultureYearOffset = detectedOffset;
      } else {
        const fileYear = resolveCsvYear(file);
        if (!fileYear) {
          alert("Année invalide. Import annulé.");
          return;
        }
        if (baseCultureYearRef.current == null) {
          baseCultureYearRef.current = fileYear;
        }
        if (fileYear > baseCultureYearRef.current) {
          alert(
            `Le fichier est plus récent que l'année de référence (${baseCultureYearRef.current}). Import annulé.`
          );
          return;
        }
        cultureYearOffset = baseCultureYearRef.current - fileYear;
      }
      const feats = isCsv
        ? await parseParcellesCsvToFeatures(file)
        : await parseTelepacXmlToFeatures(file, { cultureYearOffset });
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
      const { toAdd, mismatches } = isCsv
        ? { toAdd: feats, mismatches: [] }
        : mergeTelepacFeatures(draw, feats);
      for (const ft of toAdd) draw.add(ft);

      resolveOverlappingParcels(draw);

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

      if (mismatches.length) {
        const topMismatches = mismatches.slice(0, 5);
        const details = topMismatches
          .map(
            (entry) =>
              `- ${entry.label} (similarité max ${(entry.maxSimilarity * 100).toFixed(1)}%)`
          )
          .join("\n");
        alert(
          "Certaines parcelles se chevauchent mais ne correspondent pas au seuil attendu (95%).\n" +
            `Parcelles concernées: ${mismatches.length}.\n` +
            "Elles sont surlignées en orange sur la carte : sélectionne-les pour décider si c'est la même parcelle ou deux parcelles distinctes.\n" +
            details +
            (mismatches.length > topMismatches.length ? "\n..." : "")
        );
      }

      onImported?.(feats);
    } catch (err) {
      const code = err?.code ? ` [${err.code}]` : "";
      console.error(err);
      onError?.(err);
      alert(
        `Impossible de lire ce fichier.${code} Vérifie qu’il s’agit bien d’un export Télépac ou CSV.`
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
        title="Importer un XML Télépac ou CSV"
        disabled={disabled || loading}
      >
        <IconUpload />{" "}
        {compact ? null : (
          <span>{labelImport || (loading ? "Import..." : "Importer XML/CSV")}</span>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={fileAccept}
        onChange={onPickFile}
        style={{ display: "none" }}
      />
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
      const blob = new Blob([xml], { type: "application/xml;charset=ISO-8859-1" });
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
