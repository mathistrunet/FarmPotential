import React, { useMemo } from "react";
import {
  buildDetectedSoilCombinations,
  buildSoilCombinationKey,
  SOIL_RULE_ATTRIBUTES,
} from "../services/soilTypeMapping";

const ATTRIBUTE_LABELS = {
  texture: "Texture",
  profondeur: "Profondeur",
  position_topo: "Topo",
  hydromorphie: "Hydromorphie",
  ph_classe: "pH",
  cailloux: "Cailloux",
};

function formatHa(value) {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function valueLabel(value) {
  return value ? value : "Non renseigne";
}

function buildParcelLabel(parcel, fallbackIndex) {
  const properties = parcel?.feature?.properties || {};
  const name = String(properties.nom || "").trim();
  if (name) return name;
  const ilot = String(properties.ilot_numero || "").trim();
  const numero = String(properties.numero || "").trim();
  if (ilot || numero) return [ilot, numero].filter(Boolean).join(".");
  return `Parcelle ${fallbackIndex + 1}`;
}

export default function SoilTypeMappingPanel({
  parcelCandidates = [],
  parcelCount = 0,
  rrpVisible = false,
  loading = false,
  onRefresh,
}) {
  const detectedCombinations = useMemo(
    () => buildDetectedSoilCombinations(parcelCandidates),
    [parcelCandidates]
  );

  const parcelLabelsByCombination = useMemo(() => {
    const grouped = new Map();
    parcelCandidates.forEach((parcel, index) => {
      const key = buildSoilCombinationKey(parcel?.soilRow || {});
      const current = grouped.get(key) || [];
      current.push(buildParcelLabel(parcel, index));
      grouped.set(key, current);
    });
    return grouped;
  }, [parcelCandidates]);

  const totalSurfaceHa = useMemo(
    () =>
      parcelCandidates.reduce(
        (sum, parcel) => sum + Number(parcel?.surfaceHa || 0),
        0
      ),
    [parcelCandidates]
  );

  if (!parcelCount) {
    return (
      <div style={{ paddingTop: 10 }}>
        <p style={{ marginTop: 0, color: "#555", fontSize: 13 }}>
          Importe d&apos;abord des parcelles pour voir les types de sols detectes.
        </p>
      </div>
    );
  }

  if (!rrpVisible) {
    return (
      <div style={{ paddingTop: 10 }}>
        <p style={{ marginTop: 0, color: "#555", fontSize: 13 }}>
          Active la couche <strong>Carte des sols France</strong> dans l&apos;onglet
          calques pour visualiser les types de sols presents sur les parcelles
          importees.
        </p>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 10, display: "grid", gap: 12 }}>
      <p style={{ marginTop: 0, color: "#555", fontSize: 13 }}>
        Vue simple des types de sols detectes sur les parcelles importees. Les
        regroupements ci-dessous sont bases sur les attributs RRP visibles sur
        la carte.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => onRefresh?.()}
          disabled={loading}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
            background: loading ? "#e2e8f0" : "#f8fafc",
            color: "#0f172a",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
          title="Recharger les types de sols depuis la couche RRP"
        >
          {loading ? "Rechargement..." : "Recharger les sols"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
        }}
      >
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fff" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>Parcelles analysees</div>
          <strong>{parcelCandidates.length}</strong>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fff" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>Types detectes</div>
          <strong>{detectedCombinations.length}</strong>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fff" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>Surface totale</div>
          <strong>{formatHa(totalSurfaceHa)} ha</strong>
        </div>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ maxHeight: 520, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 }}>
              <tr>
                <th style={{ textAlign: "left", padding: 8 }}>Type detecte</th>
                {SOIL_RULE_ATTRIBUTES.map((attributeName) => (
                  <th key={attributeName} style={{ textAlign: "left", padding: 8 }}>
                    {ATTRIBUTE_LABELS[attributeName]}
                  </th>
                ))}
                <th style={{ textAlign: "left", padding: 8 }}>Parcelles</th>
                <th style={{ textAlign: "left", padding: 8 }}>Surface</th>
              </tr>
            </thead>
            <tbody>
              {detectedCombinations.map((combination) => {
                const parcelLabels = parcelLabelsByCombination.get(combination.key) || [];
                return (
                  <tr key={combination.key} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8, minWidth: 220 }}>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{combination.label}</div>
                      <div style={{ marginTop: 6, color: "#64748b" }}>
                        {parcelLabels.slice(0, 5).join(", ")}
                        {parcelLabels.length > 5 ? ` +${parcelLabels.length - 5}` : ""}
                      </div>
                    </td>
                    {SOIL_RULE_ATTRIBUTES.map((attributeName) => (
                      <td key={attributeName} style={{ padding: 8 }}>
                        {valueLabel(combination.row[attributeName])}
                      </td>
                    ))}
                    <td style={{ padding: 8 }}>{combination.parcels}</td>
                    <td style={{ padding: 8 }}>{formatHa(combination.surfaceHa)} ha</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
