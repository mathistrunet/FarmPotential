// src/Front/TelepacButton.jsx
import React, { useRef, useState } from "react";
import { parseTelepacXmlToFeatures, buildTelepacXML } from "../services/telepacXml";
import { buildParcellesCsv } from "../services/csvExport";

/** Icônes légères inline (gardées) */
const iconStyle = { width: 18, height: 18, display: "inline-block", verticalAlign: "-3px" };
const IconUpload = () => (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M12 3l4 4h-3v6h-2V7H8l4-4zM5 18h14v2H5v-2z" fill="currentColor" />
  </svg>
);
const IconDownload = () => (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M11 5h2v8h3l-4 4-4-4h3V5zM5 19h14v2H5v-2z" fill="currentColor" />
  </svg>
);


export default function ImportTelepacButton({
  mapRef,
  drawRef,
  setFeatures,
  selectFeatureOnMap,
  compact = false,
  buttonStyle,
  disabled = false,
  fileAccept = ".xml",
  // mode = "append", Si on veut réactiver la fonction replace à l'import d'un parcellaire
  zoomOnImport = true,
  labelImport,
  onImported,
  onError,
}) {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);

  const btnDefault = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: compact ? "6px 8px" : "8px 12px",
    borderRadius: 8,
    background: "#fff",
    border: "1px solid #d1d5db",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled || loading ? 0.6 : 1,
    fontSize: 14,
  };
  const btn = { ...btnDefault, ...(buttonStyle || {}) };

  async function onPickXmlFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const feats = await parseTelepacXmlToFeatures(file);
      const draw = drawRef?.current,
        map = mapRef?.current;
      if (!draw || !map) return;

      // // Nettoyage si mode replace
      // if (mode === "replace") {
      //   const ids = (draw.getAll()?.features ?? []).map((f) => f.id).filter(Boolean);
      //   if (ids.length) draw.delete(ids);
      // }

      // Ajout des features
      // (on peut ajouter un FeatureCollection d’un coup mais on garde l’itératif robuste)
      for (const ft of feats) draw.add(ft);

      // Zoom sur l’emprise (MultiPolygon pris en charge)
      if (zoomOnImport && feats.length) {
        let minLon = Infinity,
          minLat = Infinity,
          maxLon = -Infinity,
          maxLat = -Infinity;
        for (const f of feats) {
          const t = f.geometry?.type;
          const coords =
            t === "Polygon"
              ? f.geometry.coordinates.flat(1)
              : t === "MultiPolygon"
              ? f.geometry.coordinates.flat(2)
              : [];
          for (const [lon, lat] of coords) {
            if (lon < minLon) minLon = lon;
            if (lat < minLat) minLat = lat;
            if (lon > maxLon) maxLon = lon;
            if (lat > maxLat) maxLat = lat;
          }
        }
        if (minLon < Infinity) {
          try {
            map.fitBounds(
              [
                [minLon, minLat],
                [maxLon, maxLat],
              ],
              { padding: 40 }
            );
          } catch {
            /* ignore fitBounds errors */
          }
        }
      }

      // Synchronise la liste et sélectionne la 1ʳᵉ
      const arr = draw.getAll()?.features ?? [];
      const polys = arr.filter((f) => f.geometry?.type === "Polygon");
      setFeatures?.(polys);
      if (arr[0]?.id && typeof selectFeatureOnMap === "function") {
        selectFeatureOnMap(arr[0].id, false);
      }

      onImported?.(feats);
    } catch (err) {
      console.error(err);
      onError?.(err);
      alert("Impossible de lire ce XML. Vérifie qu’il s’agit bien d’un export Télépac.");
    } finally {
      setLoading(false);
      // Permet de ré-importer le même fichier juste après
      e.target.value = "";
    }
  }

  return (
    <>
      <button
        onClick={() => !disabled && !loading && fileInputRef.current?.click()}
        style={btn}
        title="Importer un XML Télépac"
        disabled={disabled || loading}
      >
        <IconUpload />{" "}
        {compact ? null : <span>{labelImport || (loading ? "Import..." : "Importer XML")}</span>}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={fileAccept}
        onChange={onPickXmlFile}
        style={{ display: "none" }}
      />
    </>
  );
}

/**
 * Bouton d’export Télépac (XML)
 *
 * Props :
 * - features: Feature[]
 * - compact?: boolean
 * - buttonStyle?: object
 * - disabled?: boolean
 * - labelExport?: string
 * - filenamePrefix?: string (defaut: "telepac_export_")
 * - onError?: (err) => void
 */
function randomCode() {
  return String(Math.floor(Math.random() * 99999) + 1);
}

export function ExportTelepacButton({
  features = [],
  compact = false,
  buttonStyle,
  disabled = false,
  labelExport,
  filenamePrefix = "telepac_export_",
  onError,
}) {
  const [loading, setLoading] = useState(false);
  const [showChoice, setShowChoice] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvForm, setCsvForm] = useState(() => ({
    secteur: "TEST",
    exploitation: "Exploitation 1",
    codeExploitation: randomCode(),
  }));
  const [csvError, setCsvError] = useState("");

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

  function ensureFeaturesAvailable() {
    if (!features.length) {
      alert("Dessine ou importe au moins une parcelle.");
      return false;
    }
    return true;
  }

  function exportXML() {
    if (!ensureFeaturesAvailable()) return;
    setLoading(true);
    try {
      const xml = buildTelepacXML(features);
      const blob = new Blob([xml], { type: "application/xml;charset=ISO-8859-1" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenamePrefix}${Date.now()}.xml`;
      a.click();
      URL.revokeObjectURL(url); // hygiène mémoire
    } catch (err) {
      console.error(err);
      onError?.(err);
      alert("Échec de l’export Télépac.");
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    if (!ensureFeaturesAvailable()) return;

    const secteur = csvForm.secteur.trim();
    const exploitation = csvForm.exploitation.trim();
    const codeExploitation = (csvForm.codeExploitation ?? "").toString().trim();

    if (!secteur || !exploitation || !codeExploitation) {
      setCsvError("Merci de renseigner tous les champs.");
      return;
    }

    setLoading(true);
    try {
      const csv = buildParcellesCsv(features, {
        secteur,
        exploitation,
        codeExploitation,
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `parcelles_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setCsvError("");
      setShowCsvModal(false);
    } catch (err) {
      console.error(err);
      onError?.(err);
      alert("Échec de l’export CSV.");
    } finally {
      setLoading(false);
    }
  }

  function handleMainClick() {
    if (disabled || loading) return;
    if (!ensureFeaturesAvailable()) return;
    setShowChoice(true);
  }

  function handleChooseCsv() {
    setShowChoice(false);
    setCsvError("");
    setCsvForm((prev) => ({
      secteur: prev.secteur || "TEST",
      exploitation: prev.exploitation || "Exploitation 1",
      codeExploitation: prev.codeExploitation || randomCode(),
    }));
    setShowCsvModal(true);
  }

  const choiceMenu = showChoice ? (
    <>
      <div
        onClick={() => setShowChoice(false)}
        style={{ position: "fixed", inset: 0, background: "transparent", zIndex: 25 }}
      />
      <div
        style={{
          position: "fixed",
          right: compact ? 12 : 20,
          bottom: compact ? 64 : 86,
          background: "#fff",
          border: "1px solid #d1d5db",
          borderRadius: 10,
          padding: 12,
          boxShadow: "0 12px 30px rgba(15,23,42,0.18)",
          zIndex: 30,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minWidth: 200,
        }}
      >
        <button
          onClick={() => {
            setShowChoice(false);
            exportXML();
          }}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#f8fafc",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          Export Télépac (XML)
        </button>
        <button
          onClick={handleChooseCsv}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#f8fafc",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          Export CSV
        </button>
      </div>
    </>
  ) : null;

  const csvModal = showCsvModal ? (
    <>
      <div
        onClick={() => {
          setCsvError("");
          setShowCsvModal(false);
        }}
        style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 35 }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 40,
          background: "#fff",
          borderRadius: 14,
          padding: 24,
          width: "min(420px, 92vw)",
          boxShadow: "0 22px 60px rgba(15,23,42,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Exporter au format CSV</h3>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 0, marginBottom: 16 }}>
          Renseigne les informations générales qui seront reprises pour chaque parcelle.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
            Secteur
            <input
              value={csvForm.secteur}
              onChange={(e) => {
                setCsvError("");
                setCsvForm((prev) => ({ ...prev, secteur: e.target.value }));
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
              }}
            />
          </label>
          <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
            Exploitation
            <input
              value={csvForm.exploitation}
              onChange={(e) => {
                setCsvError("");
                setCsvForm((prev) => ({ ...prev, exploitation: e.target.value }));
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
              }}
            />
          </label>
          <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
            Code exploitation
            <input
              value={csvForm.codeExploitation}
              onChange={(e) => {
                setCsvError("");
                setCsvForm((prev) => ({ ...prev, codeExploitation: e.target.value }));
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
              }}
            />
          </label>
          {csvError && (
            <div style={{ color: "#b91c1c", fontSize: 12 }}>{csvError}</div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button
            onClick={() => {
              setCsvError("");
              setShowCsvModal(false);
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Annuler
          </button>
          <button
            onClick={exportCSV}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
            disabled={loading}
          >
            {loading ? "Export..." : "Exporter CSV"}
          </button>
        </div>
      </div>
    </>
  ) : null;

  return (
    <>
      <button
        onClick={handleMainClick}
        style={btn}
        title="Exporter les parcelles"
        disabled={disabled || loading}
      >
        <IconDownload />{" "}
        {compact ? null : <span>{labelExport || (loading ? "Export..." : "Exporter")}</span>}
      </button>
      {choiceMenu}
      {csvModal}
    </>
  );
}
