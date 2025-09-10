// src/features/draw/DrawToolbar.jsx
import React, { useCallback, useEffect, useState } from "react";
import { ringAreaM2 } from "../utils/geometry";

/** Petite lib d’icônes inline, légères */
const iconStyle = { width: 18, height: 18, display: "inline-block", verticalAlign: "-3px" };
const IconTarget  = () => <svg viewBox="0 0 24 24" style={iconStyle}><path d="M12 8a4 4 0 104 4h2a6 6 0 11-6-6v2zM11 2h2v4h-2V2zm0 16h2v4h-2v-4zM2 11h4v2H2v-2zm16 0h4v2H18v-2z" fill="currentColor"/></svg>;
const IconPolygon = () => <svg viewBox="0 0 24 24" style={iconStyle}><path d="M5 3l6 2 7 5-3 9H6L3 8 5 3zm1.6 3.1L4.9 8.7l1.9 6.3h7.8l2.3-6.9-5.6-4-4.7 1z" fill="currentColor"/></svg>;
const IconSquare  = () => <svg viewBox="0 0 24 24" style={iconStyle}><rect x="5" y="5" width="14" height="14" fill="currentColor"/></svg>;
const IconTrash   = () => <svg viewBox="0 0 24 24" style={iconStyle}><path d="M6 7h12l-1 13H7L6 7zm3-3h6l1 2H8l1-2z" fill="currentColor"/></svg>;
const IconEdit    = () => <svg viewBox="0 0 24 24" style={iconStyle}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/></svg>;
const IconCheck   = () => <svg viewBox="0 0 24 24" style={iconStyle}><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.4-1.4z" fill="currentColor"/></svg>;

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
  compact = false,
  className
}) {
  const [mode, setMode] = useState("simple_select");

  const btn = {
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: compact ? "6px 8px" : "8px 12px",
    borderRadius: 8, background: "#fff", border: "1px solid #d1d5db",
    cursor: "pointer", fontSize: 14
  };
  const label = (t) => (compact ? null : <span>{t}</span>);

  /** 🔎 Agrandit les "poignées" (sommets/milieux) de Mapbox Draw pour faciliter la sélection */
  const enlargeVertexHitbox = useCallback((radius = 8, strokeWidth = 3) => {
    const map = mapRef?.current;
    if (!map || typeof map.getStyle !== "function") return;
    const style = map.getStyle();
    const layers = style?.layers || [];
    layers.forEach((ly) => {
      const id = ly.id || "";
      // Cible les calques de points de Draw : vertex & midpoint (actifs/inactifs)
      if (/gl-draw.*(vertex|midpoint)/.test(id)) {
        try { map.setPaintProperty(id, "circle-radius", radius); } catch {
          /* ignore errors when updating vertex radius */
        }
        try { map.setPaintProperty(id, "circle-stroke-width", strokeWidth); } catch {
          /* ignore errors when updating vertex stroke */
        }
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
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 40 }
    );
  }

  /** Démarrer le mode “dessin de polygone” */
  function startDrawPolygon() {
    const draw = drawRef?.current;
    draw?.changeMode?.("draw_polygon");
  }

  /** Passer en mode édition (déplacement des sommets) sur la sélection courante */
  function startEditSelected() {
    const draw = drawRef?.current;
    const map  = mapRef?.current;
    if (!draw) return;

    // Essaie d’éditer la sélection ; à défaut, la dernière parcelle
    const selIds = (draw.getSelectedIds?.() || (draw.getSelected?.().features || []).map(f => f.id)) || [];
    let id = selIds[0];
    if (!id) {
      const arr = draw.getAll()?.features ?? [];
      id = arr.length ? arr[arr.length - 1].id : null;
    }
    if (!id) { alert("Sélectionne d'abord une parcelle."); return; }

    draw.changeMode("direct_select", { featureId: id });
    // Laisse le temps aux couches Draw d’être (ré)ajoutées, puis agrandit les poignées
    setTimeout(() => enlargeVertexHitbox(9, 4), 0);
    // Optionnel : zoom léger sur la parcelle
    try {
      if (map) {
        const ring = draw.get(id)?.geometry?.coordinates?.[0] || [];
        if (ring.length) {
          const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
          map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60 });
        }
      }
    } catch {
      /* ignore map fitting errors */
    }
  }

  /** Quitter l’édition (retour en sélection simple) */
  function stopEdit() {
    const draw = drawRef?.current;
    if (!draw) return;
    draw.changeMode("simple_select");
  }

  /** Ajouter un carré “exemple” au centre de la carte (utile pour tester) */
  function addSquareAtCenter() {
    const map = mapRef?.current, draw = drawRef?.current;
    if (!map || !draw) return;
    const c = map.getCenter();
    const dx = 0.02, dy = 0.01; // ~ dimensions en degrés (grossières)
    const ring = [
      [c.lng - dx, c.lat - dy],
      [c.lng + dx, c.lat - dy],
      [c.lng + dx, c.lat + dy],
      [c.lng - dx, c.lat + dy],
      [c.lng - dx, c.lat - dy],
    ];
    draw.add({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring] },
    });

    // Sélectionner la dernière feature et rafraîchir la liste
    const after = draw.getAll();
    const arr = after?.features ?? [];
    const last = arr[arr.length - 1];
    if (last?.id && typeof selectFeatureOnMap === "function") {
      selectFeatureOnMap(last.id, true);
    }
    const polys = arr.filter((f) => f.geometry?.type === "Polygon");
    setFeatures?.(polys);
  }

  /** Supprimer la sélection courante dans Draw */
  function deleteSelection() {
    const draw = drawRef?.current;
    if (!draw) return;
    draw.trash?.();
    // Rafraîchir la liste après suppression
    const arr = draw.getAll()?.features ?? [];
    const polys = arr.filter((f) => f.geometry?.type === "Polygon");
    setFeatures?.(polys);
  }

  /**
   * Sync auto: quand Draw crée / met à jour / supprime, on met à jour la liste.
   * (Les events 'draw.create|update|delete' viennent de map, pas de draw.)
   * On en profite aussi pour écouter le changement de mode pour suivre l’état et
   * agrandir les poignées au moment opportun.
   */
  useEffect(() => {
    const map = mapRef?.current;
    const draw = drawRef?.current;
    if (!map || !draw) return;

    const refreshFromDraw = () => {
      const arr = draw.getAll()?.features ?? [];
      const polys = arr.filter((f) => f.geometry?.type === "Polygon");
      polys.forEach((f) => {
        const ring = f.geometry?.coordinates?.[0];
        if (ring) {
          const ha = ringAreaM2(ring) / 10000;
          f.properties = { ...f.properties, surfaceHa: ha };
        }
      });
      setFeatures?.(polys);
    };

    const onMode = (e) => {
      const m = e?.mode || "simple_select";
      setMode(m);
      // Quand on entre en 'draw_polygon' ou 'direct_select', on booste la hitbox
      if (m === "draw_polygon" || m === "direct_select") {
        // petit délai pour que les calques Draw soient présents
        setTimeout(() => enlargeVertexHitbox(9, 4), 0);
      }
    };

    map.on("draw.create", refreshFromDraw);
    map.on("draw.update", refreshFromDraw);
    map.on("draw.delete", refreshFromDraw);
    map.on("draw.modechange", onMode);

    return () => {
      map.off("draw.create", refreshFromDraw);
      map.off("draw.update", refreshFromDraw);
      map.off("draw.delete", refreshFromDraw);
      map.off("draw.modechange", onMode);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef?.current, drawRef?.current, setFeatures, enlargeVertexHitbox]);

  return (
    <div className={className} style={{ display:"flex", alignItems:"center", gap: 10 }}>
      <button onClick={recenterOnFeatures} style={btn} title="Recentrer sur les parcelles">
        <IconTarget /> {label("Recentrer")}
      </button>

      <button onClick={startDrawPolygon} style={btn} title="Dessiner un polygone">
        <IconPolygon /> {label("Polygone")}
      </button>

      <button onClick={startEditSelected} style={btn} title="Rééditer la parcelle sélectionnée">
        <IconEdit /> {label("Rééditer")}
      </button>

      <button onClick={stopEdit} style={btn} title="Terminer l’édition et revenir à la sélection">
        <IconCheck /> {label("Terminer")}
      </button>

      <button onClick={addSquareAtCenter} style={btn} title="Ajouter un carré au centre">
        <IconSquare /> {label("Carré centre")}
      </button>

      <button onClick={deleteSelection} style={btn} title="Supprimer la sélection">
        <IconTrash /> {label("Supprimer")}
      </button>

      {/* Indication légère du mode courant (debug/UX) */}
      {!compact && (
        <span style={{ marginLeft: 6, fontSize: 12, color: "#666" }}>
          Mode : <code>{mode}</code>
        </span>
      )}
    </div>
  );
}
