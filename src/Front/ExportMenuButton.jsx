// src/Front/ExportMenuButton.jsx
import React, { useMemo, useState } from "react";
import { buildTelepacXML } from "../services/telepacXml";
import { buildParcellesCsv } from "../services/parcellesCsv";

const iconStyle = { width: 18, height: 18, display: "inline-block", verticalAlign: "-3px" };
const IconDownload = () => (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M11 5h2v8h3l-4 4-4-4h3V5zM5 19h14v2H5v-2z" fill="currentColor" />
  </svg>
);

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ChoiceModal({ onClose, onTelepac, onCsv }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Choisir un format d&apos;export</h2>
        <p style={{ color: "#555", marginBottom: 16 }}>
          Sélectionne le format souhaité pour générer ton fichier.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" style={modalButtonStyle} onClick={onTelepac}>
            Export Télépac (XML)
          </button>
          <button type="button" style={modalButtonStyle} onClick={onCsv}>
            Export CSV
          </button>
        </div>
        <button type="button" style={modalSecondaryButtonStyle} onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  );
}

function CsvModal({ values, onChange, onCancel, onConfirm, disabled }) {
  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Paramètres de l&apos;export CSV</h2>
        <p style={{ color: "#555", marginBottom: 16 }}>
          Ces informations seront appliquées à chaque parcelle exportée.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <label style={labelStyle}>
            Secteur
            <input
              type="text"
              value={values.secteur}
              onChange={(e) => onChange({ ...values, secteur: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Exploitation
            <input
              type="text"
              value={values.exploitation}
              onChange={(e) =>
                onChange({ ...values, exploitation: e.target.value })
              }
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Numero pacage
            <input
              type="text"
              value={values.codeExploitation}
              onChange={(e) =>
                onChange({ ...values, codeExploitation: e.target.value })
              }
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Nom de la structure
            <input
              type="text"
              value={values.structureName}
              onChange={(e) =>
                onChange({ ...values, structureName: e.target.value })
              }
              style={inputStyle}
              placeholder="Ex: Assolia"
            />
          </label>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="button" style={modalSecondaryButtonStyle} onClick={onCancel}>
              Annuler
            </button>
            <button type="submit" style={modalButtonStyle} disabled={disabled}>
              Exporter en CSV
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  zIndex: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const modalStyle = {
  background: "#fff",
  borderRadius: 12,
  padding: 24,
  maxWidth: 420,
  width: "100%",
  boxShadow: "0 15px 40px rgba(0,0,0,0.18)",
};

const modalButtonStyle = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontSize: 14,
  cursor: "pointer",
};

const modalSecondaryButtonStyle = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111",
  fontSize: 14,
  cursor: "pointer",
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  fontSize: 14,
  color: "#333",
};

const inputStyle = {
  marginTop: 4,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 14,
};

export default function ExportMenuButton({
  features = [],
  compact = false,
  buttonStyle,
  disabled = false,
  label = "Faire un export",
  filenamePrefixXml = "telepac_export_",
  filenamePrefixCsv = "parcelles_",
  csvValues: csvValuesProp,
  onCsvValuesChange,
}) {
  const [showChoice, setShowChoice] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [loading, setLoading] = useState(false);

  const defaultCode = useMemo(
    () => String(Math.floor(Math.random() * 99999) + 1).padStart(5, "0"),
    []
  );

  const [internalCsvValues, setInternalCsvValues] = useState({
    secteur: "TEST",
    exploitation: "Exploitation 1",
    codeExploitation: defaultCode,
    structureName: "",
  });
  const csvValues = csvValuesProp ?? internalCsvValues;
  const setCsvValues = onCsvValuesChange ?? setInternalCsvValues;

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

  const closeAllModals = () => {
    setShowChoice(false);
    setShowCsv(false);
  };

  const ensureFeatures = () => {
    if (!features.length) {
      alert("Dessine ou importe au moins une parcelle.");
      closeAllModals();
      return false;
    }
    return true;
  };

  const exportTelepac = () => {
    if (!ensureFeatures()) return;
    setLoading(true);
    try {
      const xml = buildTelepacXML(features);
      const blob = new Blob([xml], {
        type: "application/xml;charset=ISO-8859-1",
      });
      downloadBlob(blob, `${filenamePrefixXml}${Date.now()}.xml`);
    } catch (err) {
      console.error(err);
      alert("Échec de l’export Télépac.");
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = async () => {
    if (!ensureFeatures()) return;
    setLoading(true);
    try {
      const csv = await buildParcellesCsv(
        features,
        csvValues.secteur,
        csvValues.exploitation,
        csvValues.codeExploitation,
        { structureName: csvValues.structureName }
      );
      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8",
      });
      downloadBlob(blob, `${filenamePrefixCsv}${Date.now()}.csv`);
      closeAllModals();
    } catch (err) {
      console.error(err);
      alert("Échec de l’export CSV.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => !disabled && !loading && setShowChoice(true)}
        style={btn}
        title="Exporter des données"
        disabled={disabled || loading}
      >
        <IconDownload /> {compact ? null : <span>{label}</span>}
      </button>

      {showChoice && (
        <ChoiceModal
          onClose={closeAllModals}
          onTelepac={() => {
            setShowChoice(false);
            exportTelepac();
          }}
          onCsv={() => {
            if (!ensureFeatures()) return;
            setShowChoice(false);
            setShowCsv(true);
          }}
        />
      )}

      {showCsv && (
        <CsvModal
          values={csvValues}
          onChange={setCsvValues}
          onCancel={closeAllModals}
          onConfirm={exportCsv}
          disabled={loading}
        />
      )}
    </>
  );
}
