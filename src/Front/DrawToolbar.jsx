// src/features/draw/DrawToolbar.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { featureAreaM2 } from "../utils/geometry";
import { resolveOverlappingParcels } from "../utils/overlapResolution";
import { mergeFeaturesByIds } from "../utils/parcelleFusion";
import {
  splitParcelleByLine,
  snapLineExtremitiesToParcelBorder,
  findNearestBorderPoint,
} from "../utils/parcelleSplit";

/** Petite lib d'icônes inline, légères */
const iconStyle = { width: 18, height: 18, display: "inline-block", verticalAlign: "-3px" };
const IconTarget  = () => <svg viewBox="0 0 24 24" style={iconStyle}><path d="M12 8a4 4 0 104 4h2a6 6 0 11-6-6v2zM11 2h2v4h-2V2zm0 16h2v4h-2v-4zM2 11h4v2H2v-2zm16 0h4v2H18v-2z" fill="currentColor"/></svg>;
const IconPolygon = () => <svg viewBox="0 0 24 24" style={iconStyle}><path d="M5 3l6 2 7 5-3 9H6L3 8 5 3zm1.6 3.1L4.9 8.7l1.9 6.3h7.8l2.3-6.9-5.6-4-4.7 1z" fill="currentColor"/></svg>;
const IconTrash   = () => <svg viewBox="0 0 24 24" style={iconStyle}><path d="M6 7h12l-1 13H7L6 7zm3-3h6l1 2H8l1-2z" fill="currentColor"/></svg>;
const IconCheck   = () => <svg viewBox="0 0 24 24" style={iconStyle}><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.4-1.4z" fill="currentColor"/></svg>;
const IconReset   = () => (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M6 13a6 6 0 1 0 1.76-4.24L6 11V6h5L8.9 8.1A8 8 0 1 1 4 13h2z" fill="currentColor" />
  </svg>
);
const IconSplit = () => (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M4 7h16v2H4V7zm0 8h16v2H4v-2zM11 5h2v14h-2V5z" fill="currentColor" />
  </svg>
);
const IconSelectBox = () => (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" strokeDasharray="3 2" />
  </svg>
);
const IconMerge = () => (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M4 5h6v6H4V5zm10 0h6v6h-6V5zM9 8h6v2H9V8zM7 14h10v5H7v-5z" fill="currentColor" />
  </svg>
);
const IconUndo = () => (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" fill="currentColor"/>
  </svg>
);
const IconRedo = () => (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 15.7c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 15h9V6l-3.6 4.6z" fill="currentColor"/>
  </svg>
);

const SPLIT_GAP_WIDTH_METERS = 0.03;

// Couches cartographiques pour le mode découpe
const SNAP_SOURCE_ID = "split-snap-src";
const SNAP_LAYER_ID  = "split-snap-layer";
const BORDER_SOURCE_ID = "split-border-src";
const BORDER_LAYER_ID  = "split-border-layer";
// Rayon d'accrochage ~40 m en degrés
const SNAP_THRESHOLD = 0.0004;

const DRAW_LINE_SOURCE_ID   = "split-draw-line-src";
const DRAW_LINE_LAYER_ID    = "split-draw-line-layer";
const DRAW_VERTS_SOURCE_ID  = "split-draw-verts-src";
const DRAW_VERTS_LAYER_ID   = "split-draw-verts-layer";
const PREVIEW_SOURCE_ID     = "split-preview-src";
const PREVIEW_LAYER_ID      = "split-preview-layer";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

function addSplitLayers(map, targetFeature) {
  if (!map) return;
  try {
    if (!map.getSource(BORDER_SOURCE_ID)) {
      map.addSource(BORDER_SOURCE_ID, { type: "geojson", data: targetFeature });
    } else {
      map.getSource(BORDER_SOURCE_ID).setData(targetFeature);
    }
    if (!map.getLayer(BORDER_LAYER_ID)) {
      map.addLayer({
        id: BORDER_LAYER_ID,
        type: "line",
        source: BORDER_SOURCE_ID,
        paint: { "line-color": "#f59e0b", "line-width": 3, "line-dasharray": [4, 2] },
      });
    }
    if (!map.getSource(SNAP_SOURCE_ID)) {
      map.addSource(SNAP_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.getLayer(SNAP_LAYER_ID)) {
      map.addLayer({
        id: SNAP_LAYER_ID,
        type: "circle",
        source: SNAP_SOURCE_ID,
        paint: {
          "circle-radius": 8,
          "circle-color": "#2563eb",
          "circle-opacity": 0.85,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
    }
    if (!map.getSource(DRAW_LINE_SOURCE_ID)) {
      map.addSource(DRAW_LINE_SOURCE_ID, { type: "geojson", data: EMPTY_FC });
    }
    if (!map.getLayer(DRAW_LINE_LAYER_ID)) {
      map.addLayer({
        id: DRAW_LINE_LAYER_ID,
        type: "line",
        source: DRAW_LINE_SOURCE_ID,
        paint: { "line-color": "#16a34a", "line-width": 2 },
      });
    }
    if (!map.getSource(DRAW_VERTS_SOURCE_ID)) {
      map.addSource(DRAW_VERTS_SOURCE_ID, { type: "geojson", data: EMPTY_FC });
    }
    if (!map.getLayer(DRAW_VERTS_LAYER_ID)) {
      map.addLayer({
        id: DRAW_VERTS_LAYER_ID,
        type: "circle",
        source: DRAW_VERTS_SOURCE_ID,
        paint: {
          "circle-radius": 5,
          "circle-color": "#16a34a",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
    }
    if (!map.getSource(PREVIEW_SOURCE_ID)) {
      map.addSource(PREVIEW_SOURCE_ID, { type: "geojson", data: EMPTY_FC });
    }
    if (!map.getLayer(PREVIEW_LAYER_ID)) {
      map.addLayer({
        id: PREVIEW_LAYER_ID,
        type: "line",
        source: PREVIEW_SOURCE_ID,
        paint: { "line-color": "#16a34a", "line-width": 1.5, "line-dasharray": [4, 3] },
      });
    }
  } catch {
    /* ignore layer add errors */
  }
}

function removeSplitLayers(map) {
  if (!map) return;
  for (const id of [PREVIEW_LAYER_ID, DRAW_VERTS_LAYER_ID, DRAW_LINE_LAYER_ID, SNAP_LAYER_ID, BORDER_LAYER_ID]) {
    try { if (map.getLayer(id)) map.removeLayer(id); } catch { /* ignore */ }
  }
  for (const id of [PREVIEW_SOURCE_ID, DRAW_VERTS_SOURCE_ID, DRAW_LINE_SOURCE_ID, SNAP_SOURCE_ID, BORDER_SOURCE_ID]) {
    try { if (map.getSource(id)) map.removeSource(id); } catch { /* ignore */ }
  }
}

/**
 * Barre d'outils de dessin (autonome)
 * Props:
 * - mapRef, drawRef : refs de la carte et de Mapbox/MapLibre Draw
 * - features, setFeatures : état des parcelles (polygones) + setter
 * - selectFeatureOnMap?: (id, zoom:bool) -> void pour sélectionner un polygone (optionnel)
 * - compact?: boolean (réduit les libellés)
 * - className?: string (optionnel)
 */
export default function DrawToolbar({
  mapRef,
  drawRef,
  features,
  setFeatures,
  selectFeatureOnMap,
  onReset,
  compact = false,
  className,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}) {
  const [mode, setMode] = useState("simple_select");
  const [splitTargetId, setSplitTargetId] = useState(null);
  const [splitLineCoords, setSplitLineCoords] = useState([]);
  const splitLineCoordsRef = useRef([]);

  const btn = {
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: compact ? "6px 8px" : "8px 12px",
    borderRadius: 8, background: "#fff", border: "1px solid #d1d5db",
    cursor: "pointer", fontSize: 14,
  };
  const label = (t) => (compact ? null : <span>{t}</span>);

  /** Agrandit les "poignées" (sommets/milieux) de Mapbox Draw pour faciliter la sélection */
  const enlargeVertexHitbox = useCallback((radius = 8, strokeWidth = 3) => {
    const map = mapRef?.current;
    if (!map || typeof map.getStyle !== "function") return;
    const style = map.getStyle();
    const layers = style?.layers || [];
    layers.forEach((ly) => {
      const id = ly.id || "";
      if (/gl-draw.*(vertex|midpoint)/.test(id)) {
        try { map.setPaintProperty(id, "circle-radius", radius); } catch { /* ignore */ }
        try { map.setPaintProperty(id, "circle-stroke-width", strokeWidth); } catch { /* ignore */ }
      }
    });
  }, [mapRef]);

  /** Recentrer la vue sur les features (polygones) existantes */
  function recenterOnFeatures() {
    const map = mapRef?.current;
    if (!map) return;
    if (!features?.length) { alert("Aucune parcelle à recentrer."); return; }
    const all = features.flatMap((f) => f.geometry?.coordinates?.[0] || []);
    if (!all.length) return;
    const lons = all.map((p) => p[0]);
    const lats = all.map((p) => p[1]);
    map.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: 40 }
    );
  }

  function startDrawPolygon() {
    drawRef?.current?.changeMode?.("draw_polygon");
  }

  function deleteSelection() {
    const draw = drawRef?.current;
    if (!draw) return;
    draw.trash?.();
    const arr = draw.getAll()?.features ?? [];
    const polys = arr.filter((f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon");
    setFeatures?.(polys);
  }

  function toggleMultipleSelection() {
    const draw = drawRef?.current;
    if (!draw) return;
    const next = mode === "multiple_selection" ? "simple_select" : "multiple_selection";
    draw.changeMode(next);
  }

  function startSplitParcel() {
    const draw = drawRef?.current;
    if (!draw) return;
    const selIds = (draw.getSelectedIds?.() || (draw.getSelected?.().features || []).map((f) => f.id)) || [];
    const targetId = selIds[0];
    if (!targetId) {
      alert("Sélectionne d'abord une parcelle à découper.");
      return;
    }
    const target = draw.get?.(targetId);
    if (!target || (target.geometry?.type !== "Polygon" && target.geometry?.type !== "MultiPolygon")) {
      alert("La sélection doit être une parcelle polygonale.");
      return;
    }
    splitLineCoordsRef.current = [];
    setSplitLineCoords([]);
    setSplitTargetId(targetId);
    draw.changeMode("simple_select");
  }

  function applySplitFromLine(lineFeature) {
    const draw = drawRef?.current;
    if (!draw || !splitTargetId) return false;
    const target = draw.get?.(splitTargetId);
    if (!target) return false;
    const pieces = splitParcelleByLine(target, lineFeature, SPLIT_GAP_WIDTH_METERS);
    if (pieces.length < 2) {
      alert("Le tracé doit traverser la parcelle pour la découper en 2.");
      return false;
    }
    draw.delete(splitTargetId);
    pieces.forEach((polygonCoordinates) => {
      draw.add({
        type: "Feature",
        properties: { ...(target.properties || {}) },
        geometry: { type: "Polygon", coordinates: polygonCoordinates },
      });
    });
    return true;
  }

  function cancelSplitParcel() {
    const draw = drawRef?.current;
    const map = mapRef?.current;
    if (!draw) return;
    removeSplitLayers(map);
    splitLineCoordsRef.current = [];
    setSplitLineCoords([]);
    setSplitTargetId(null);
    draw.changeMode("simple_select");
  }

  function confirmSplitParcel() {
    const draw = drawRef?.current;
    const map = mapRef?.current;
    const coords = splitLineCoordsRef.current;
    if (!draw || !splitTargetId || coords.length < 2) return;
    const targetFeature = draw.get?.(splitTargetId);
    if (!targetFeature) return;

    const lineFeature = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {},
    };
    const snappedLineFeature = snapLineExtremitiesToParcelBorder(targetFeature, lineFeature);
    const splitDone = applySplitFromLine(snappedLineFeature);
    removeSplitLayers(map);
    splitLineCoordsRef.current = [];
    setSplitLineCoords([]);
    if (splitDone) {
      setSplitTargetId(null);
      draw.changeMode("simple_select");
      refreshFromDraw();
    }
  }

  const refreshFromDraw = useCallback(() => {
    const draw = drawRef?.current;
    if (!draw) return;
    const arr = draw.getAll()?.features ?? [];
    const polys = arr.filter((f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon");
    polys.forEach((f) => {
      const area = featureAreaM2(f);
      if (area != null) f.properties = { ...f.properties, surfaceHa: area / 10000 };
    });
    setFeatures?.(polys);
  }, [drawRef, setFeatures]);

  function resolveOverlaps() {
    const draw = drawRef?.current;
    if (!draw) return;
    resolveOverlappingParcels(draw);
    refreshFromDraw();
  }

  function mergeSelection() {
    const draw = drawRef?.current;
    if (!draw) return;
    const selectedIds = draw.getSelectedIds?.() || [];
    if (selectedIds.length < 2) {
      alert("Sélectionnez au moins deux parcelles (mode multi-sélection), puis cliquez sur Fusionner.");
      return;
    }
    const allFeatures = draw.getAll()?.features || [];
    const selectedFeatures = allFeatures.filter((f) => selectedIds.map(String).includes(String(f.id)));
    const choices = selectedFeatures
      .map((f, i) => `${i + 1}. ${f?.properties?.nom_affiche || f?.properties?.parcelle || f?.properties?.numero || f.id}`)
      .join("\n");
    const answer = window.prompt(
      `Quelle parcelle doit conserver ses données de tableau après fusion ?\n${choices}\n\nEntrez le numéro de la parcelle à conserver :`,
      "1"
    );
    if (answer == null) return;
    const keepIndex = Number(answer.trim()) - 1;
    if (!Number.isInteger(keepIndex) || keepIndex < 0 || keepIndex >= selectedFeatures.length) {
      alert("Choix invalide. Veuillez saisir un numéro de parcelle valide.");
      return;
    }
    try {
      const keepId = selectedFeatures[keepIndex].id;
      const { feature, removedIds } = mergeFeaturesByIds(allFeatures, selectedIds, keepId);
      draw.delete(selectedIds);
      const addedIds = draw.add(feature);
      refreshFromDraw();
      const mergedId = Array.isArray(addedIds) && addedIds.length ? addedIds[0] : feature?.id;
      if (mergedId) selectFeatureOnMap?.(mergedId, true);
      if (removedIds.length) alert("Fusion effectuée : les autres lignes de parcelles ont été supprimées.");
    } catch (error) {
      alert(error?.message || "La fusion des parcelles a échoué.");
    }
  }

  /**
   * Sync auto des events Draw + gestion du mode découpe.
   */
  useEffect(() => {
    const map = mapRef?.current;
    const draw = drawRef?.current;
    if (!map || !draw) return;

    const onMode = (e) => {
      const m = e?.mode || "simple_select";
      setMode(m);
      if (m === "draw_polygon" || m === "direct_select") {
        setTimeout(() => enlargeVertexHitbox(9, 4), 0);
      }
    };

    const onCreate = (event) => {
      refreshFromDraw();
    };

    map.on("draw.create", onCreate);
    map.on("draw.update", refreshFromDraw);
    map.on("draw.delete", refreshFromDraw);
    map.on("draw.modechange", onMode);

    return () => {
      map.off("draw.create", onCreate);
      map.off("draw.update", refreshFromDraw);
      map.off("draw.delete", refreshFromDraw);
      map.off("draw.modechange", onMode);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef?.current, drawRef?.current, refreshFromDraw, enlargeVertexHitbox]);

  /** Dessin clic-à-clic + indicateur de snap en temps réel pendant le tracé de la ligne de découpe */
  useEffect(() => {
    const map = mapRef?.current;
    const draw = drawRef?.current;

    if (!splitTargetId || !map || !draw) {
      removeSplitLayers(map);
      return;
    }

    const targetFeature = draw.get?.(splitTargetId);
    if (!targetFeature) return;

    addSplitLayers(map, targetFeature);
    map.getCanvas().style.cursor = "crosshair";

    const updateDrawLayers = (coords) => {
      if (coords.length >= 2) {
        map.getSource(DRAW_LINE_SOURCE_ID)?.setData({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {},
        });
      } else {
        map.getSource(DRAW_LINE_SOURCE_ID)?.setData(EMPTY_FC);
      }
      map.getSource(DRAW_VERTS_SOURCE_ID)?.setData({
        type: "FeatureCollection",
        features: coords.map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: {} })),
      });
    };

    const handleClick = (e) => {
      const cursor = [e.lngLat.lng, e.lngLat.lat];
      const snapPt = findNearestBorderPoint(cursor, targetFeature, SNAP_THRESHOLD);
      const newCoord = snapPt || cursor;
      const newCoords = [...splitLineCoordsRef.current, newCoord];
      splitLineCoordsRef.current = newCoords;
      setSplitLineCoords(newCoords);
      updateDrawLayers(newCoords);
      map.getSource(PREVIEW_SOURCE_ID)?.setData(EMPTY_FC);
    };

    const handleMouseMove = (e) => {
      const cursor = [e.lngLat.lng, e.lngLat.lat];
      const snapPt = findNearestBorderPoint(cursor, targetFeature, SNAP_THRESHOLD);
      map.getSource(SNAP_SOURCE_ID)?.setData({
        type: "FeatureCollection",
        features: snapPt
          ? [{ type: "Feature", geometry: { type: "Point", coordinates: snapPt }, properties: {} }]
          : [],
      });
      const coords = splitLineCoordsRef.current;
      if (coords.length > 0) {
        const last = coords[coords.length - 1];
        map.getSource(PREVIEW_SOURCE_ID)?.setData({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [last, snapPt || cursor] },
          properties: {},
        });
      }
    };

    map.on("click", handleClick);
    map.on("mousemove", handleMouseMove);

    return () => {
      map.off("click", handleClick);
      map.off("mousemove", handleMouseMove);
      map.getCanvas().style.cursor = "";
      removeSplitLayers(map);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitTargetId, mapRef?.current, drawRef?.current]);


  return (
    <div className={className} style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        onClick={onUndo}
        disabled={!canUndo}
        style={{ ...btn, opacity: canUndo ? 1 : 0.4, cursor: canUndo ? "pointer" : "default" }}
        title="Annuler (Ctrl+Z)"
      >
        <IconUndo /> {label("Annuler")}
      </button>

      <button
        onClick={onRedo}
        disabled={!canRedo}
        style={{ ...btn, opacity: canRedo ? 1 : 0.4, cursor: canRedo ? "pointer" : "default" }}
        title="Rétablir (Ctrl+Y)"
      >
        <IconRedo /> {label("Rétablir")}
      </button>

      <button onClick={recenterOnFeatures} style={btn} title="Recentrer sur les parcelles">
        <IconTarget /> {label("Recentrer")}
      </button>

      <button onClick={startDrawPolygon} style={btn} title="Dessiner un polygone">
        <IconPolygon /> {label("Polygone")}
      </button>

      <button
        onClick={toggleMultipleSelection}
        style={{ ...btn, background: mode === "multiple_selection" ? "#eef6ff" : "#fff" }}
        title="Sélection multiple"
      >
        <IconSelectBox /> {label("Multi-sélection")}
      </button>

      <button onClick={resolveOverlaps} style={btn} title="Découper pour éviter les superpositions">
        <IconSplit /> {label("Découper chevauchements")}
      </button>

      <button onClick={mergeSelection} style={btn} title="Fusionner les parcelles sélectionnées">
        <IconMerge /> {label("Fusionner")}
      </button>

      <button
        onClick={startSplitParcel}
        style={{ ...btn, background: splitTargetId ? "#eef6ff" : "#fff" }}
        title="Tracer la ligne de découpe de la parcelle sélectionnée"
      >
        <IconSplit /> {label(splitTargetId ? "Tracer découpe…" : "Découper parcelle")}
      </button>

      {splitTargetId && splitLineCoords.length >= 2 && (
        <button
          onClick={confirmSplitParcel}
          style={{ ...btn, background: "#dcfce7", borderColor: "#86efac" }}
          title="Valider la découpe tracée"
        >
          <IconCheck /> {label("Valider découpe")}
        </button>
      )}

      {splitTargetId && (
        <button
          onClick={cancelSplitParcel}
          style={{ ...btn, background: "#fee2e2", borderColor: "#fca5a5" }}
          title="Annuler le tracé de découpe"
        >
          <IconTrash /> {label(splitLineCoords.length ? "Annuler découpe" : "Annuler")}
        </button>
      )}

      <button onClick={deleteSelection} style={btn} title="Supprimer la sélection">
        <IconTrash /> {label("Supprimer")}
      </button>

      <button onClick={onReset} style={btn} title="Réinitialiser toutes les parcelles">
        <IconReset /> {label("Réinitialiser")}
      </button>

      {!compact && (
        <span style={{ marginLeft: 6, fontSize: 12, color: "#666" }}>
          Mode : <code>{mode}</code>
          {splitTargetId
            ? ` · Cliquez pour poser les sommets (${splitLineCoords.length} posé${splitLineCoords.length !== 1 ? "s" : ""}). Approchez d'une bordure pour l'accroche (●). Cliquez "Valider" pour découper.`
            : ""}
        </span>
      )}
    </div>
  );
}
