import React from "react";

export default function SoilInfoPanel({ info }) {
  if (!info) return null;
  const style = {
    position: "absolute",
    top: 10,
    left: 10,
    zIndex: 30,
    background: "rgba(255,255,255,0.95)",
    padding: 8,
    maxWidth: 320,
    maxHeight: 400,
    overflowY: "auto",
    fontSize: 12,
    border: "1px solid #ccc",
    borderRadius: 4,
  };
  if (info.loading) return <div style={style}>Chargement…</div>;
  if (info.error) return <div style={style}>Erreur lors de la récupération des données RRP.</div>;
  if (!info.properties) return <div style={style}>Aucune information RRP à cet emplacement.</div>;
  return (
    <div style={style}>
      <strong>Proportions de sols</strong>
      <ul style={{ margin: "4px 0", paddingLeft: 16 }}>
        {Object.entries(info.proportions || {}).map(([k, v]) => (
          <li key={k}>
            {k} : {v}
          </li>
        ))}
      </ul>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {JSON.stringify(info.properties, null, 2)}
      </pre>
    </div>
  );
}
