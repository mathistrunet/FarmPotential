// src/Front/ExportMenuButton.jsx
import React, { useEffect, useMemo, useState } from "react";
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

// Type de sol d'une parcelle, dans le même ordre de résolution que l'export CSV.
function getFeatureSoilType(props = {}) {
  const raw = props.type_sol ?? props.TYPE_SOL ?? props.typeSol ?? props.type_de_sol ?? props.sol ?? "";
  return raw == null ? "" : String(raw).trim();
}

// Nettoie un nom pour en faire un nom de fichier valide sous Windows. Les navigateurs ajoutent
// automatiquement « (1) », « (2) »… si le fichier existe déjà dans les téléchargements.
function sanitizeFilename(name, fallback = "export") {
  const cleaned = String(name || "")
    .trim()
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "");
  return cleaned || fallback;
}

// Coquille de modale partagée : la croix (×) et un clic « à côté » ferment, mais une sélection de
// texte qui démarre dans la modale et se relâche sur l'overlay NE ferme pas (on n'écoute que le
// mousedown dont la cible est l'overlay lui-même).
function ModalShell({ onClose, children }) {
  const handleOverlayMouseDown = (e) => {
    if (e.target === e.currentTarget) onClose();
  };
  return (
    <div style={overlayStyle} onMouseDown={handleOverlayMouseDown}>
      <div style={modalStyle}>
        <button type="button" aria-label="Fermer" onClick={onClose} style={closeXStyle}>
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

function ChoiceModal({ onClose, onTelepac, onCsv }) {
  return (
    <ModalShell onClose={onClose}>
      <div>
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
    </ModalShell>
  );
}

function CsvModal({
  values,
  onChange,
  onCancel,
  onConfirm,
  disabled,
  soilTypes = [],
  soilReplacements = {},
  onSoilReplacementChange,
  missingSoilCount = 0,
  missingSoilFill = "",
  onMissingSoilFillChange,
}) {
  return (
    <ModalShell onClose={onCancel}>
      <div>
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

          {missingSoilCount > 0 && (
            <label style={labelStyle}>
              Type de sol pour les {missingSoilCount} parcelle(s) sans valeur
              <span style={{ color: "#777", fontWeight: 400 }}> (vide = laissé vide)</span>
              <input
                type="text"
                value={missingSoilFill}
                placeholder="Saisir un type de sol à appliquer"
                onChange={(e) => onMissingSoilFillChange(e.target.value)}
                style={inputStyle}
              />
            </label>
          )}

          {soilTypes.length > 0 && (
            <div>
              <div style={{ fontSize: 14, color: "#333", marginBottom: 6 }}>
                Remplacement des types de sol
                <span style={{ color: "#777" }}> (vide = valeur conservée)</span>
              </div>
              <div style={soilTableWrapStyle}>
                <table style={soilTableStyle}>
                  <thead>
                    <tr>
                      <th style={soilThStyle}>Type de sol</th>
                      <th style={soilThStyle}>Remplacer par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soilTypes.map((soil) => (
                      <tr key={soil}>
                        <td style={soilTdStyle}>{soil}</td>
                        <td style={soilTdStyle}>
                          <input
                            type="text"
                            value={soilReplacements[soil] ?? ""}
                            placeholder={soil}
                            onChange={(e) => onSoilReplacementChange(soil, e.target.value)}
                            style={{ ...inputStyle, marginTop: 0, width: "100%", boxSizing: "border-box" }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
    </ModalShell>
  );
}

function XmlModal({ cultureColumns, selectedColumn, onSelectColumn, onCancel, onConfirm, disabled }) {
  return (
    <ModalShell onClose={onCancel}>
      <div>
        <h2 style={{ marginTop: 0 }}>Paramètres de l&apos;export Télépac</h2>
        <p style={{ color: "#555", marginBottom: 16 }}>
          Choisis la colonne culture à utiliser pour remplir le code culture XML.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <label style={labelStyle}>
            Colonne culture
            <select
              value={selectedColumn}
              onChange={(e) => onSelectColumn(e.target.value)}
              style={inputStyle}
            >
              {cultureColumns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="button" style={modalSecondaryButtonStyle} onClick={onCancel}>
              Annuler
            </button>
            <button type="submit" style={modalButtonStyle} disabled={disabled}>
              Exporter en XML
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
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
  position: "relative",
  background: "#fff",
  borderRadius: 12,
  padding: 24,
  maxWidth: 420,
  width: "100%",
  maxHeight: "85vh",
  overflowY: "auto",
  boxShadow: "0 15px 40px rgba(0,0,0,0.18)",
};

const closeXStyle = {
  position: "absolute",
  top: 8,
  right: 10,
  width: 30,
  height: 30,
  border: "none",
  background: "transparent",
  fontSize: 24,
  lineHeight: "28px",
  color: "#6b7280",
  cursor: "pointer",
  padding: 0,
};

const soilTableWrapStyle = {
  maxHeight: 180,
  overflowY: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
};

const soilTableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  tableLayout: "fixed",
};

const soilThStyle = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid #e5e7eb",
  position: "sticky",
  top: 0,
  background: "#f9fafb",
  fontWeight: 600,
};

const soilTdStyle = {
  padding: "4px 8px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
  wordBreak: "break-word",
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
  const [showXml, setShowXml] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCultureColumn, setSelectedCultureColumn] = useState("code");

  const cultureColumns = useMemo(() => {
    const columnSet = new Set(["code"]);
    features.forEach((feature) => {
      const props = feature?.properties || {};
      Object.keys(props).forEach((key) => {
        if (/^cultureN(?:_\d+)?$/i.test(key) || /^culture\d+$/i.test(key)) {
          columnSet.add(key);
        }
      });
    });
    return Array.from(columnSet);
  }, [features]);

  useEffect(() => {
    if (!cultureColumns.includes(selectedCultureColumn)) {
      setSelectedCultureColumn(cultureColumns[0] || "code");
    }
  }, [cultureColumns, selectedCultureColumn]);

  // Types de sol distincts présents dans la sélection à exporter (pour la table de remplacement).
  const soilTypes = useMemo(() => {
    const set = new Set();
    features.forEach((feature) => {
      const value = getFeatureSoilType(feature?.properties);
      if (value) set.add(value);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [features]);

  // Map { typeDeSolOriginal -> valeur de remplacement }. Une valeur vide conserve l'original.
  const [soilReplacements, setSoilReplacements] = useState({});
  const handleSoilReplacementChange = (soil, value) =>
    setSoilReplacements((prev) => ({ ...prev, [soil]: value }));

  // Nombre de parcelles sans type de sol renseigné, et valeur à leur appliquer à l'export.
  const missingSoilCount = useMemo(
    () => features.filter((feature) => !getFeatureSoilType(feature?.properties)).length,
    [features]
  );
  const [missingSoilFill, setMissingSoilFill] = useState("");

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
    setShowXml(false);
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
      const xml = buildTelepacXML(features, {
        cultureColumn: selectedCultureColumn,
      });
      const blob = new Blob([xml], {
        type: "application/xml;charset=UTF-8",
      });
      downloadBlob(blob, `${filenamePrefixXml}${Date.now()}.xml`);
      closeAllModals();
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
      // Applique les types de sol : remplacement pour les parcelles qui en ont un (vide = conservé),
      // et valeur manuelle pour celles qui n'en ont pas (vide = laissé vide).
      const fillMissing = (missingSoilFill || "").trim();
      const featuresForExport = features.map((feature) => {
        const original = getFeatureSoilType(feature?.properties);
        const value = original ? (soilReplacements[original] || "").trim() : fillMissing;
        if (!value) return feature;
        return {
          ...feature,
          properties: { ...(feature.properties || {}), type_sol: value, TYPE_SOL: value },
        };
      });
      const csv = await buildParcellesCsv(
        featuresForExport,
        csvValues.secteur,
        csvValues.exploitation,
        csvValues.codeExploitation,
        { structureName: csvValues.structureName }
      );
      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8",
      });
      // Nom de fichier = nom de l'exploitation. Le navigateur ajoute « (1) », « (2) »… si un
      // fichier du même nom existe déjà dans les téléchargements.
      downloadBlob(blob, `${sanitizeFilename(csvValues.exploitation, filenamePrefixCsv || "export")}.csv`);
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
            if (!ensureFeatures()) return;
            setShowChoice(false);
            setShowXml(true);
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
          soilTypes={soilTypes}
          soilReplacements={soilReplacements}
          onSoilReplacementChange={handleSoilReplacementChange}
          missingSoilCount={missingSoilCount}
          missingSoilFill={missingSoilFill}
          onMissingSoilFillChange={setMissingSoilFill}
        />
      )}

      {showXml && (
        <XmlModal
          cultureColumns={cultureColumns}
          selectedColumn={selectedCultureColumn}
          onSelectColumn={setSelectedCultureColumn}
          onCancel={closeAllModals}
          onConfirm={exportTelepac}
          disabled={loading}
        />
      )}
    </>
  );
}
