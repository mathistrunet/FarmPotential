// src/Front/ExportMenuButton.jsx
//
// Sortie unique de l'outil : trois formats (CSV Assolia, XML Télépac, shapefile),
// chacun précédé d'un court formulaire de paramétrage.

import { useEffect, useMemo, useState } from "react";

import Modal from "../components/Modal";
import { buildTelepacXML } from "../services/telepacXml";
import { buildParcellesCsv } from "../services/parcellesCsv";
import { buildParcelShapefileZip } from "../services/parcelleShapefile";

const iconStyle = { width: 17, height: 17, display: "inline-block", verticalAlign: "-3px" };
const IconDownload = () => (
  <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
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
  const raw =
    props.type_sol ?? props.TYPE_SOL ?? props.typeSol ?? props.type_de_sol ?? props.sol ?? "";
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

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: "var(--fs-md)",
  fontWeight: 600,
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--c-border-strong)",
  fontSize: "var(--fs-md)",
  fontFamily: "inherit",
  fontWeight: 400,
};

const EXPORT_CHOICES = [
  {
    id: "csv",
    title: "CSV Assolia",
    description:
      "Assolement complet (cultures N à N-4, surfaces, type de sol) prêt à importer dans Assolia.",
  },
  {
    id: "xml",
    title: "XML Télépac",
    description: "Fichier de déclaration au format Télépac, à partir d'une colonne de culture.",
  },
  {
    id: "shp",
    title: "Shapefile (.zip)",
    description: "Contours et attributs pour un SIG (QGIS, ArcGIS) ou un outil tiers.",
  },
];

function ChoiceModal({ onClose, onSelect }) {
  return (
    <Modal
      open
      width={560}
      title="Exporter le parcellaire"
      subtitle="Choisissez le format de sortie ; un formulaire vous demandera ensuite les quelques informations nécessaires."
      onClose={onClose}
      footer={
        <button type="button" className="fp-btn" onClick={onClose}>
          Annuler
        </button>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        {EXPORT_CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className="fp-btn"
            onClick={() => onSelect(choice.id)}
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 3,
              padding: "12px 14px",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: "var(--fs-lg)", fontWeight: 700 }}>{choice.title}</span>
            <span className="fp-hint" style={{ fontWeight: 400 }}>
              {choice.description}
            </span>
          </button>
        ))}
      </div>
    </Modal>
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
    <Modal
      open
      width={560}
      title="Export CSV Assolia"
      subtitle="Ces informations identifient l'exploitation dans le fichier généré."
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="fp-btn" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="submit"
            form="fp-csv-form"
            className="fp-btn fp-btn--primary"
            style={{ marginLeft: "auto" }}
            disabled={disabled}
          >
            Télécharger le CSV
          </button>
        </>
      }
    >
      <form
        id="fp-csv-form"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <label style={labelStyle}>
          Secteur
          <input
            type="text"
            value={values.secteur}
            onChange={(event) => onChange({ ...values, secteur: event.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Exploitation
          <input
            type="text"
            value={values.exploitation}
            onChange={(event) => onChange({ ...values, exploitation: event.target.value })}
            style={inputStyle}
          />
          <span className="fp-hint" style={{ fontWeight: 400 }}>
            Donne aussi son nom au fichier téléchargé.
          </span>
        </label>
        <label style={labelStyle}>
          Numéro PACAGE
          <input
            type="text"
            value={values.codeExploitation}
            onChange={(event) => onChange({ ...values, codeExploitation: event.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Nom de la structure
          <input
            type="text"
            value={values.structureName}
            onChange={(event) => onChange({ ...values, structureName: event.target.value })}
            style={inputStyle}
            placeholder="Ex : Assolia"
          />
          <span className="fp-hint" style={{ fontWeight: 400 }}>
            Laissez vide pour conserver les libellés de culture tels quels.
          </span>
        </label>

        {missingSoilCount > 0 && (
          <label style={labelStyle}>
            Type de sol des {missingSoilCount} parcelle{missingSoilCount > 1 ? "s" : ""} sans
            valeur
            <input
              type="text"
              value={missingSoilFill}
              placeholder="Laisser vide pour ne rien écrire"
              onChange={(event) => onMissingSoilFillChange(event.target.value)}
              style={inputStyle}
            />
          </label>
        )}

        {soilTypes.length > 0 && (
          <details>
            <summary style={{ cursor: "pointer", fontSize: "var(--fs-md)", fontWeight: 600 }}>
              Renommer les types de sol ({soilTypes.length})
            </summary>
            <div
              style={{
                maxHeight: 190,
                overflowY: "auto",
                border: "1px solid var(--c-border)",
                borderRadius: "var(--r-md)",
                marginTop: 8,
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-md)", tableLayout: "fixed" }}>
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
                          onChange={(event) => onSoilReplacementChange(soil, event.target.value)}
                          style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fp-hint" style={{ marginTop: 6 }}>
              Un champ laissé vide conserve la valeur d'origine.
            </p>
          </details>
        )}
      </form>
    </Modal>
  );
}

const soilThStyle = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid var(--c-border)",
  position: "sticky",
  top: 0,
  background: "var(--c-surface-muted)",
  fontWeight: 600,
};

const soilTdStyle = {
  padding: "4px 8px",
  borderBottom: "1px solid var(--c-border)",
  verticalAlign: "middle",
  wordBreak: "break-word",
};

function XmlModal({ cultureColumns, selectedColumn, onSelectColumn, onCancel, onConfirm, disabled }) {
  return (
    <Modal
      open
      width={460}
      title="Export XML Télépac"
      subtitle="Indiquez quelle colonne de culture doit alimenter le code culture du fichier."
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="fp-btn" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="submit"
            form="fp-xml-form"
            className="fp-btn fp-btn--primary"
            style={{ marginLeft: "auto" }}
            disabled={disabled}
          >
            Télécharger le XML
          </button>
        </>
      }
    >
      <form
        id="fp-xml-form"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <label style={labelStyle}>
          Colonne culture
          <select
            value={selectedColumn}
            onChange={(event) => onSelectColumn(event.target.value)}
            style={inputStyle}
          >
            {cultureColumns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </label>
      </form>
    </Modal>
  );
}

function ShapefileModal({ values, onChange, onCancel, onConfirm, disabled }) {
  return (
    <Modal
      open
      width={460}
      title="Export shapefile"
      subtitle="Une archive .zip contenant .shp, .dbf, .shx et .prj est générée."
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="fp-btn" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="submit"
            form="fp-shp-form"
            className="fp-btn fp-btn--primary"
            style={{ marginLeft: "auto" }}
            disabled={disabled || !values.raisSoc.trim()}
          >
            Télécharger le shapefile
          </button>
        </>
      }
    >
      <form
        id="fp-shp-form"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <label style={labelStyle}>
          Nom de l'exploitation
          <input
            type="text"
            value={values.raisSoc}
            onChange={(event) => onChange({ ...values, raisSoc: event.target.value })}
            style={inputStyle}
            placeholder="Obligatoire"
          />
          <span className="fp-hint" style={{ fontWeight: 400 }}>
            Écrit en majuscules dans l'attribut RAIS_SOCIA.
          </span>
        </label>
        <label style={labelStyle}>
          Campagne
          <input
            type="text"
            value={values.campagne}
            onChange={(event) => onChange({ ...values, campagne: event.target.value })}
            style={inputStyle}
          />
        </label>
      </form>
    </Modal>
  );
}

export default function ExportMenuButton({
  features = [],
  setFeatures,
  disabled = false,
  variant = "default",
  label = "Exporter",
  className = "",
  filenamePrefixXml = "telepac_export_",
  filenamePrefixCsv = "parcelles_",
  filenamePrefixShp = "parcellaire_",
  csvValues: csvValuesProp,
  onCsvValuesChange,
}) {
  const [activeModal, setActiveModal] = useState(null); // null | "choice" | "csv" | "xml" | "shp"
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
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

  // Types de sol distincts présents dans la sélection à exporter (table de remplacement).
  const soilTypes = useMemo(() => {
    const set = new Set();
    features.forEach((feature) => {
      const value = getFeatureSoilType(feature?.properties);
      if (value) set.add(value);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [features]);

  const [soilReplacements, setSoilReplacements] = useState({});
  const handleSoilReplacementChange = (soil, value) =>
    setSoilReplacements((prev) => ({ ...prev, [soil]: value }));

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

  const [shapefileValues, setShapefileValues] = useState({
    raisSoc: "",
    campagne: String(new Date().getFullYear()),
  });

  const closeAllModals = () => setActiveModal(null);

  const openExport = () => {
    if (!features.length) {
      setErrorMessage(
        "Aucune parcelle à exporter. Importez un parcellaire ou dessinez au moins une parcelle."
      );
      return;
    }
    // Pré-remplit le nom d'exploitation du shapefile avec ce qui est déjà connu.
    const firstProps = features[0]?.properties || {};
    setShapefileValues((prev) => ({
      ...prev,
      raisSoc:
        prev.raisSoc ||
        String(firstProps.RAIS_SOCIA || firstProps.rais_soc || csvValues.exploitation || "")
          .trim()
          .toUpperCase(),
      campagne: prev.campagne || String(firstProps.CAMPAGNE || new Date().getFullYear()),
    }));
    setActiveModal("choice");
  };

  const exportTelepac = () => {
    setLoading(true);
    try {
      const xml = buildTelepacXML(features, { cultureColumn: selectedCultureColumn });
      downloadBlob(
        new Blob([xml], { type: "application/xml;charset=UTF-8" }),
        `${filenamePrefixXml}${Date.now()}.xml`
      );
      closeAllModals();
    } catch (error) {
      console.error("[EXPORT_XML]", error);
      setErrorMessage("Échec de l'export Télépac. Consultez la console pour le détail.");
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = async () => {
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
      downloadBlob(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
        `${sanitizeFilename(csvValues.exploitation, filenamePrefixCsv || "export")}.csv`
      );
      closeAllModals();
    } catch (error) {
      console.error("[EXPORT_CSV]", error);
      setErrorMessage("Échec de l'export CSV. Consultez la console pour le détail.");
    } finally {
      setLoading(false);
    }
  };

  const exportShapefile = async () => {
    const name = shapefileValues.raisSoc.trim();
    if (!name) return;
    setLoading(true);
    try {
      const { blob, updatedFeatures } = await buildParcelShapefileZip(features, {
        raisSoc: name,
        campagne: shapefileValues.campagne.trim() || String(new Date().getFullYear()),
      });
      if (typeof setFeatures === "function") setFeatures(updatedFeatures);
      downloadBlob(blob, `${sanitizeFilename(name, filenamePrefixShp)}.zip`);
      closeAllModals();
    } catch (error) {
      console.error("[EXPORT_SHP]", error);
      setErrorMessage(
        error?.message === "RAIS_SOCIA_REQUIRED"
          ? "Renseignez un nom d'exploitation pour l'export shapefile."
          : "Échec de l'export shapefile. Consultez la console pour le détail."
      );
    } finally {
      setLoading(false);
    }
  };

  const buttonClass = ["fp-btn", variant === "primary" ? "fp-btn--primary" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={() => !disabled && !loading && openExport()}
        disabled={disabled || loading}
        title="Exporter le parcellaire (CSV Assolia, XML Télépac ou shapefile)"
      >
        <IconDownload />
        <span>{loading ? "Export en cours…" : label}</span>
      </button>

      {activeModal === "choice" && (
        <ChoiceModal onClose={closeAllModals} onSelect={(id) => setActiveModal(id)} />
      )}

      {activeModal === "csv" && (
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

      {activeModal === "xml" && (
        <XmlModal
          cultureColumns={cultureColumns}
          selectedColumn={selectedCultureColumn}
          onSelectColumn={setSelectedCultureColumn}
          onCancel={closeAllModals}
          onConfirm={exportTelepac}
          disabled={loading}
        />
      )}

      {activeModal === "shp" && (
        <ShapefileModal
          values={shapefileValues}
          onChange={setShapefileValues}
          onCancel={closeAllModals}
          onConfirm={exportShapefile}
          disabled={loading}
        />
      )}

      {errorMessage && (
        <Modal
          open
          width={440}
          title="Export impossible"
          onClose={() => setErrorMessage(null)}
          footer={
            <button
              type="button"
              className="fp-btn fp-btn--primary"
              style={{ marginLeft: "auto" }}
              onClick={() => setErrorMessage(null)}
            >
              Fermer
            </button>
          }
        >
          <p style={{ margin: 0, fontSize: "var(--fs-md)", lineHeight: 1.6 }}>{errorMessage}</p>
        </Modal>
      )}
    </>
  );
}
