import React from "react";

import {
  FIELD_LIB,
  FIELD_PROF,
  FIELD_TEXTURE,
  FIELD_UCS,
} from "../config/soilsLocalConfig";

function getFirstValue(properties, keys) {
  if (!properties) return null;
  for (const key of keys) {
    if (key in properties && properties[key] != null && properties[key] !== "") {
      return properties[key];
    }
  }
  return null;
}

export default function SoilInfoPanel({ info, onClose }) {
  if (!info) return null;

  const features = Array.isArray(info.features) ? info.features : [];
  const lngLat = info.lngLat;
  const handleClose = () => {
    if (typeof onClose === "function") {
      onClose();
    }
  };

  const style = {
    position: "absolute",
    top: 10,
    left: 10,
    zIndex: 30,
    background: "rgba(255,255,255,0.97)",
    padding: 12,
    maxWidth: 360,
    maxHeight: 440,
    overflowY: "auto",
    fontSize: 12,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
  };

  const coordText =
    lngLat && typeof lngLat.lng === "number" && typeof lngLat.lat === "number"
      ? `${lngLat.lat.toFixed(5)}°, ${lngLat.lng.toFixed(5)}°`
      : null;

  return (
    <div style={style}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <strong style={{ fontSize: 13 }}>Information sols</strong>
          {coordText ? (
            <span style={{ color: "#555", marginTop: 2 }}>Coordonnées : {coordText}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleClose}
          style={{
            border: "1px solid #d1d5db",
            background: "#fff",
            borderRadius: 4,
            fontSize: 12,
            padding: "2px 6px",
            cursor: "pointer",
          }}
          aria-label="Fermer le panneau d'information sols"
        >
          ×
        </button>
      </div>

      {features.length === 0 ? (
        <div style={{ color: "#555" }}>Aucune information RRP à cet emplacement.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {features.map((feature, idx) => {
            const props = feature?.properties ?? {};
            const label =
              getFirstValue(props, FIELD_LIB) ||
              getFirstValue(props, FIELD_UCS) ||
              `Polygone ${idx + 1}`;
            const texture = getFirstValue(props, FIELD_TEXTURE);
            const profondeur = getFirstValue(props, FIELD_PROF);
            const entries = Object.entries(props).sort(([a], [b]) =>
              a.localeCompare(b)
            );

            return (
              <div
                key={feature.id ?? idx}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  padding: 8,
                  background: "#fafafa",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {texture ? (
                    <span style={{ color: "#555" }}>Texture : {texture}</span>
                  ) : null}
                  {profondeur ? (
                    <span style={{ color: "#555" }}>Profondeur : {profondeur}</span>
                  ) : null}
                </div>
                <table
                  style={{
                    width: "100%",
                    marginTop: 6,
                    borderCollapse: "collapse",
                    fontSize: 12,
                  }}
                >
                  <tbody>
                    {entries.map(([key, value]) => (
                      <tr key={key}>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "2px 4px",
                            color: "#555",
                            fontWeight: 500,
                            width: "45%",
                          }}
                        >
                          {key}
                        </th>
                        <td style={{ padding: "2px 4px", color: "#333" }}>
                          {value != null && value !== ""
                            ? String(value)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
