// src/Front/TelepacButton.jsx
import React, { useRef, useState } from "react";
import { parseTelepacXmlToFeatures, buildTelepacXML } from "../services/telepacXml";
import { parseParcellesCsvToFeatures } from "../services/parcellesCsv";
import { featureAreaM2, polygonAreaM2 } from "../utils/geometry";
import * as polygonClipping from "polygon-clipping";

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

function filterMergeProps(props) {
  return Object.fromEntries(
    Object.entries(props || {}).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
}

function updateDrawFeatureProperties(draw, feature, propsToMerge) {
  const merged = { ...(feature.properties || {}), ...filterMergeProps(propsToMerge) };
  if (feature.id && typeof draw?.setFeatureProperty === "function") {
    Object.entries(merged).forEach(([key, value]) => {
      draw.setFeatureProperty(feature.id, key, value);
    });
    return;
  }
  if (typeof draw?.delete === "function" && typeof draw?.add === "function") {
    if (feature.id) draw.delete(feature.id);
    draw.add({ ...feature, properties: merged });
    return;
  }
  feature.properties = merged;
}

const polygonClippingModule = polygonClipping;
const clipIntersection =
  polygonClippingModule.intersection ?? polygonClippingModule.default?.intersection;

function getClippingGeometry(feature) {
  if (!feature?.geometry) return null;
  const { type, coordinates } = feature.geometry;
  if (type === "Polygon") return coordinates;
  if (type === "MultiPolygon") return coordinates;
  return null;
}

function intersectionArea(existingFeature, incomingFeature) {
  if (!clipIntersection) return 0;
  const existingGeom = getClippingGeometry(existingFeature);
  const incomingGeom = getClippingGeometry(incomingFeature);
  if (!existingGeom || !incomingGeom) return 0;
  const intersection = clipIntersection(existingGeom, incomingGeom);
  if (!Array.isArray(intersection) || intersection.length === 0) return 0;
  return intersection.reduce((sum, polygon) => sum + polygonAreaM2(polygon), 0);
}

function mergeTelepacFeatures(draw, incomingFeatures) {
  const existing = draw.getAll()?.features ?? [];
  if (!existing.length) {
    return { toAdd: incomingFeatures, didMerge: false };
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

  overlapsByIncoming.forEach((overlaps, incomingIndex) => {
    overlaps.forEach(({ existingIndex, similarity }) => {
      if (similarity < similarityThreshold) return;
      const existingEntry = existingEntries[existingIndex];
      if (!existingEntry) return;
      matchedExistingIds.add(existingEntry.id);
      updateDrawFeatureProperties(
        draw,
        existingEntry.feature,
        incomingEntries[incomingIndex].feature.properties || {}
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

  return { toAdd, didMerge: true };
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
      if (isCsv) {
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
        ? await parseParcellesCsvToFeatures(file, { cultureYearOffset })
        : await parseTelepacXmlToFeatures(file);
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
      const { toAdd } = isCsv ? { toAdd: feats } : mergeTelepacFeatures(draw, feats);
      for (const ft of toAdd) draw.add(ft);

      // Zoom sur l’emprise (MultiPolygon pris en charge)
      if (zoomOnImport && toAdd.length) {
        let minLon = Infinity,
          minLat = Infinity,
          maxLon = -Infinity,
          maxLat = -Infinity;
        for (const f of toAdd) {
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
      const polys = arr.filter((f) => f.geometry?.type === "Polygon");
      setFeatures?.(polys);
      if (arr[0]?.id && typeof selectFeatureOnMap === "function") {
        selectFeatureOnMap(arr[0].id, false);
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
