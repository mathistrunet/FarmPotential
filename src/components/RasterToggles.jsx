import React, { useCallback } from "react";
import { RASTER_LAYERS } from "../config/rasterLayers";

export default function RasterToggles({
  mapRef,
  layerState,
  onLayerToggle,
  onLayerOpacityChange,
}) {
  const handleVisibilityChange = useCallback(
    (layerId, visible) => {
      const map = mapRef.current;
      if (!map || !map.getLayer(layerId)) return;
      map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    },
    [mapRef]
  );

  const handleOpacityChange = useCallback(
    (layerId, value) => {
      const map = mapRef.current;
      if (!map || !map.getLayer(layerId)) return;
      map.setPaintProperty(layerId, "raster-opacity", value);
    },
    [mapRef]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {RASTER_LAYERS.map((def) => {
        const lyrId = def.mapLayerId || `${def.id}_lyr`;
        const state = layerState?.[def.id] || {};
        const visible = !!state.visible;
        const opacity =
          typeof state.opacity === "number"
            ? state.opacity
            : def.defaultOpacity ?? 1;

        return (
          <div
            key={def.id}
            style={{
              border: "1px solid #eee",
              borderRadius: 8,
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => {
                  const nextVisible = e.target.checked;
                  handleVisibilityChange(lyrId, nextVisible);
                  if (typeof onLayerToggle === "function") {
                    onLayerToggle(def.id, nextVisible);
                  }
                }}
              />
              <span>{def.label}</span>
            </label>
            {def.featureInfo ? (
              <span style={{ fontSize: 11, color: "#2563eb" }}>
                ℹ️ Informations disponibles via un clic sur la carte
              </span>
            ) : null}
            {def.infoNote ? (
              <p style={{ margin: 0, fontSize: 11, color: "#555" }}>{def.infoNote}</p>
            ) : null}
            {def.legendUrl ? (
              <details
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                <summary>Afficher la légende</summary>
                <img
                  src={def.legendUrl}
                  alt={`Légende ${def.label}`}
                  style={{ marginTop: 6, maxWidth: "100%" }}
                  loading="lazy"
                />
              </details>
            ) : null}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#666" }}>Opacité</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={opacity}
                onInput={(e) => {
                  const nextValue = parseFloat(e.currentTarget.value);
                  handleOpacityChange(lyrId, nextValue);
                  if (typeof onLayerOpacityChange === "function") {
                    onLayerOpacityChange(def.id, nextValue);
                  }
                }}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
