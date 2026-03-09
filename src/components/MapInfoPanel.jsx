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

function renderPropertiesTable(properties) {
  if (!properties || Object.keys(properties).length === 0) {
    return null;
  }

  const entries = Object.entries(properties).sort(([a], [b]) =>
    a.localeCompare(b, "fr", { sensitivity: "base" }),
  );

  return (
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
              {value != null && value !== "" ? String(value) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderEntriesList(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: "6px 0 0",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 12,
      }}
    >
      {entries.map((entry, idx) => (
        <li key={entry.label ?? idx} style={{ color: "#333" }}>
          <strong style={{ color: "#555" }}>{entry.label} :</strong> {entry.value ?? "—"}
        </li>
      ))}
    </ul>
  );
}

function SoilSection({ soils }) {
  if (!soils) return null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 600 }}>Carte des sols (RRP)</div>
      {soils.loading ? (
        <div style={{ color: "#555", fontSize: 12 }}>Chargement…</div>
      ) : Array.isArray(soils.features) && soils.features.length > 0 ? (
        soils.features.map((feature, idx) => {
          const props = feature?.properties ?? {};
          const label =
            getFirstValue(props, FIELD_LIB) ||
            getFirstValue(props, FIELD_UCS) ||
            `Polygone ${idx + 1}`;
          const texture = getFirstValue(props, FIELD_TEXTURE);
          const profondeur = getFirstValue(props, FIELD_PROF);

          return (
            <div
              key={feature.id ?? idx}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                padding: 8,
                background: "#fafafa",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ fontWeight: 600 }}>{label}</div>
              {texture ? (
                <span style={{ color: "#555", fontSize: 12 }}>
                  Texture : {texture}
                </span>
              ) : null}
              {profondeur ? (
                <span style={{ color: "#555", fontSize: 12 }}>
                  Profondeur : {profondeur}
                </span>
              ) : null}
              {renderPropertiesTable(props)}
            </div>
          );
        })
      ) : (
        <div style={{ color: "#555", fontSize: 12 }}>
          Aucune information RRP à cet emplacement.
        </div>
      )}
    </section>
  );
}

function LayerSection({ layer }) {
  if (!layer) return null;

  const { label, loading, error, data } = layer;
  const summary = data?.summary;
  const entries = data?.entries;
  const items = data?.items;

  return (
    <section
      style={{
        borderTop: "1px solid #e5e7eb",
        paddingTop: 10,
        marginTop: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ fontWeight: 600 }}>{label}</div>
      {loading ? (
        <div style={{ color: "#555", fontSize: 12 }}>Chargement…</div>
      ) : error ? (
        <div style={{ color: "#b91c1c", fontSize: 12 }}>
          Impossible de récupérer l'information ({error}).
        </div>
      ) : (
        <>
          {summary ? (
            <div style={{ color: "#333", fontSize: 12 }}>{summary}</div>
          ) : null}
          {renderEntriesList(entries)}
          {Array.isArray(items) && items.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((item, idx) => (
                <div
                  key={item.id ?? idx}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    padding: 8,
                    background: "#f9fafb",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{item.title ?? `Entité ${idx + 1}`}</div>
                  {renderPropertiesTable(item.properties)}
                </div>
              ))}
            </div>
          ) : null}
          {!summary && (!entries || entries.length === 0) &&
          (!items || items.length === 0) ? (
            <div style={{ color: "#555", fontSize: 12 }}>
              Aucune information disponible pour cette couche.
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export default function MapInfoPanel({ info, onClose }) {
  if (!info) return null;

  const soils = info.soils;
  const layers = Array.isArray(info.layers) ? info.layers : [];
  const hasSoilContent =
    soils && (soils.loading || (Array.isArray(soils.features) && soils.features.length > 0));
  const hasLayerContent = layers.some(
    (layer) => layer && (layer.loading || layer.error || layer.data),
  );

  if (!hasSoilContent && !hasLayerContent) {
    return null;
  }

  const lngLat = info.lngLat;
  const coordText =
    lngLat && typeof lngLat.lng === "number" && typeof lngLat.lat === "number"
      ? `${lngLat.lat.toFixed(5)}°, ${lngLat.lng.toFixed(5)}°`
      : null;

  const handleClose = () => {
    if (typeof onClose === "function") {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 30,
        background: "rgba(255,255,255,0.97)",
        padding: 12,
        maxWidth: 380,
        maxHeight: 480,
        overflowY: "auto",
        fontSize: 12,
        border: "1px solid #d1d5db",
        borderRadius: 8,
        boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
      }}
    >
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
          <strong style={{ fontSize: 13 }}>Informations environnementales</strong>
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
          aria-label="Fermer le panneau d'information carte"
        >
          ×
        </button>
      </div>

      {hasSoilContent ? <SoilSection soils={soils} /> : null}
      {layers.map((layer) => (
        <LayerSection key={layer.id} layer={layer} />
      ))}
    </div>
  );
}
