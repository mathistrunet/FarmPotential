import React from "react";

import { BDTOPO_LAYERS } from "../config/bdtopoLayers";

const containerStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const cardStyle = {
  border: "1px solid #eee",
  borderRadius: 8,
  padding: 8,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const noteStyle = {
  margin: 0,
  fontSize: 11,
  color: "#555",
};

export default function BdtTopoToggles({
  state,
  onToggle,
  onOpacityChange,
  onRetry,
}) {
  return (
    <div style={containerStyle}>
      {BDTOPO_LAYERS.map((def) => {
        const layerState = state?.[def.id] || {};
        const visible = !!layerState.visible;
        const loading = !!layerState.loading;
        const error = layerState.error;
        const opacity =
          typeof layerState.opacity === "number"
            ? layerState.opacity
            : def.defaultOpacity ?? 1;
        const supportsOpacity = def.renderers.some(
          (renderer) => !!renderer.opacityPaintProperty,
        );
        const loaded = !!layerState.loaded;

        const handleToggle = (nextVisible) => {
          if (typeof onToggle === "function") {
            const maybePromise = onToggle(def.id, nextVisible);
            if (maybePromise && typeof maybePromise.catch === "function") {
              maybePromise.catch(() => {});
            }
          }
        };

        const handleOpacityChange = (value) => {
          if (typeof onOpacityChange === "function") {
            onOpacityChange(def.id, value);
          }
        };

        const handleRetry = () => {
          if (typeof onRetry === "function") {
            onRetry(def.id);
          }
        };

        return (
          <div key={def.id} style={cardStyle}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={visible}
                disabled={loading}
                onChange={(event) => handleToggle(event.target.checked)}
              />
              <span>{def.label}</span>
              {loading ? (
                <span style={{ fontSize: 11, color: "#2563eb" }}>Chargement…</span>
              ) : null}
            </label>

            {def.infoNote ? <p style={noteStyle}>{def.infoNote}</p> : null}

            {error ? (
              <div style={{ fontSize: 11, color: "#b91c1c" }}>
                <span>{error}</span>
                {typeof onRetry === "function" ? (
                  <button
                    type="button"
                    onClick={handleRetry}
                    style={{
                      marginLeft: 8,
                      padding: "2px 6px",
                      fontSize: 11,
                      borderRadius: 4,
                      border: "1px solid #b91c1c",
                      background: "#fee2e2",
                      color: "#991b1b",
                      cursor: "pointer",
                    }}
                  >
                    Réessayer
                  </button>
                ) : null}
              </div>
            ) : null}

            {supportsOpacity ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#666" }}>Opacité</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={opacity}
                  disabled={!loaded}
                  onInput={(event) =>
                    handleOpacityChange(parseFloat(event.currentTarget.value))
                  }
                  style={{ width: "100%" }}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
