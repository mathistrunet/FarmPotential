// src/Front/ImportParcellaireButton.jsx
//
// Point d'entrée unique pour charger un parcellaire, quel que soit son format.
// L'utilisateur clique sur « Importer », une fenêtre lui rappelle les formats
// acceptés et lui propose un fichier ou un dossier (shapefile non zippé).

import { useRef, useState } from "react";

import Modal from "../components/Modal";
import { parseTelepacXmlToFeatures } from "../services/telepacXml";
import { parseShapefileFilesToFeatures } from "../services/romaniaShapefileZip";
import {
  IMPORT_ACCEPT,
  IMPORT_FORMATS,
  importErrorMessage,
  normalizeImportedFeatures,
  parseParcellaireFileToFeatures,
  yearFromFilename,
} from "../services/parcellaireImport";
import { resolveOverlappingParcelsAsync } from "../utils/overlapResolution";
import { applyXmlImportContext } from "../utils/xmlImportContext";

const iconStyle = { width: 17, height: 17, display: "inline-block", verticalAlign: "-3px" };
const IconUpload = () => (
  <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
    <path d="M12 3l4 4h-3v6h-2V7H8l4-4zM5 18h14v2H5v-2z" fill="currentColor" />
  </svg>
);
const IconFile = () => (
  <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
    <path d="M6 2h8l4 4v16H6V2zm7 1.5V7h3.5L13 3.5z" fill="currentColor" />
  </svg>
);
const IconFolder = () => (
  <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
    <path
      d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"
      fill="currentColor"
    />
  </svg>
);

// ─── Contexte des cultures d'un XML Télépac ──────────────────────────────────

function detectTelepacMeta(text) {
  const pacageMatch = text.match(/numero-pacage="([^"]+)"/i);
  const campaignMatch = text.match(/campagne="([^"]+)"/i);
  const yearMatch = text.match(/fichier-xsd="[^"]*?((?:19|20)\d{2})[^"]*"/i);
  const year = yearMatch ? Number.parseInt(yearMatch[1], 10) : null;
  return {
    pacage: pacageMatch?.[1]?.trim() || null,
    campaign: campaignMatch?.[1]?.trim()?.toLowerCase() || null,
    year: Number.isFinite(year) ? year : null,
  };
}

async function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsText(file, "ISO-8859-1");
  });
}

function resolveXmlYear(file, metaYear) {
  if (Number.isFinite(metaYear)) return metaYear;
  const detected = yearFromFilename(file?.name);
  if (detected != null) return detected;
  const lastModified = file?.lastModified != null ? new Date(file.lastModified) : null;
  const lastModifiedYear = lastModified ? lastModified.getFullYear() : null;
  return Number.isFinite(lastModifiedYear) ? lastModifiedYear : new Date().getFullYear();
}

// Le décalage suggéré compare l'année du XML à l'année de référence de la session :
// un fichier 2022 importé après un fichier 2024 alimente par défaut la colonne N-2.
async function resolveTelepacCultureOffset(file, baseCultureYearRef) {
  const text = await readFileText(file);
  const { campaign, year, pacage } = detectTelepacMeta(text);

  let baseYear = baseCultureYearRef.current;
  if (year != null) {
    if (baseYear == null || year > baseYear) {
      baseYear = year;
      baseCultureYearRef.current = baseYear;
    }
  } else if (baseYear == null && campaign) {
    baseYear = new Date().getFullYear();
    baseCultureYearRef.current = baseYear;
  }

  if (year != null && baseYear != null) {
    const offset = baseYear - year;
    if (offset >= -1 && offset <= 6) return { offset, meta: { pacage, year } };
  }
  return { offset: null, meta: { pacage, year } };
}

const COLUMN_OPTIONS = [
  { offset: -1, label: "N+1 — culture de l'année suivante" },
  { offset: 0, label: "N — culture de l'année en cours" },
  { offset: 1, label: "N-1 — culture précédente" },
  { offset: 2, label: "N-2" },
  { offset: 3, label: "N-3" },
  { offset: 4, label: "N-4" },
  { offset: 5, label: "N-5" },
  { offset: 6, label: "N-6" },
];

function ColumnSelectDialog({ fileName, suggestedOffset, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(suggestedOffset ?? 0);
  return (
    <Modal
      open
      width={480}
      title="Année de référence des cultures"
      subtitle={`« ${fileName} » : indiquez à quelle colonne de l'assolement correspondent les cultures de ce fichier.`}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="fp-btn" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="button"
            className="fp-btn fp-btn--primary"
            style={{ marginLeft: "auto" }}
            onClick={() => onConfirm(selected)}
          >
            Importer
          </button>
        </>
      }
    >
      <label style={{ display: "grid", gap: 6, fontSize: "var(--fs-md)" }}>
        Colonne de destination
        <select
          value={selected}
          onChange={(event) => setSelected(Number(event.target.value))}
          style={{
            padding: "8px 10px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--c-border-strong)",
            fontSize: "var(--fs-md)",
            fontFamily: "inherit",
          }}
        >
          {COLUMN_OPTIONS.map((column) => (
            <option key={column.offset} value={column.offset}>
              {column.label}
            </option>
          ))}
        </select>
      </label>
      <p className="fp-hint" style={{ marginTop: 12 }}>
        Importez plusieurs millésimes à la suite pour reconstituer l'historique : chaque
        fichier alimente sa propre colonne.
      </p>
    </Modal>
  );
}

// ─── Bouton d'import ─────────────────────────────────────────────────────────

/**
 * Props :
 * - mapRef, drawRef : carte et Mapbox Draw
 * - setFeatures, selectFeatureOnMap : synchronisation de la liste de parcelles
 * - onImportMeta / onImported : remontée des métadonnées (PACAGE, année)
 * - variant : "primary" (barre du haut) ou "default"
 */
export default function ImportParcellaireButton({
  mapRef,
  drawRef,
  setFeatures,
  selectFeatureOnMap,
  disabled = false,
  variant = "default",
  label = "Importer",
  className = "",
  zoomOnImport = true,
  onImported,
  onImportMeta,
  onError,
}) {
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const baseCultureYearRef = useRef(null);
  const columnDialogResolveRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [columnDialog, setColumnDialog] = useState(null);
  const [report, setReport] = useState(null);

  const askForColumn = (fileName, suggestedOffset) =>
    new Promise((resolve) => {
      columnDialogResolveRef.current = resolve;
      setColumnDialog({ fileName, suggestedOffset });
    });

  const handleColumnConfirm = (offset) => {
    setColumnDialog(null);
    columnDialogResolveRef.current?.(offset);
    columnDialogResolveRef.current = null;
  };

  const handleColumnCancel = () => {
    setColumnDialog(null);
    columnDialogResolveRef.current?.(null);
    columnDialogResolveRef.current = null;
  };

  // Le XML Télépac est le seul format qui demande un arbitrage à l'utilisateur :
  // il est traité ici puis rendu au service d'import générique.
  const handleTelepacXml = async (file) => {
    const context = await resolveTelepacCultureOffset(file, baseCultureYearRef);
    const year = resolveXmlYear(file, context?.meta?.year);
    const suggestedOffset = Number.isFinite(context?.offset) ? context.offset : 0;

    setLoading(false);
    const chosenOffset = await askForColumn(file.name, suggestedOffset);
    setLoading(true);
    if (chosenOffset === null) return null;

    return applyXmlImportContext(await parseTelepacXmlToFeatures(file), {
      year,
      cultureOffset: chosenOffset,
    });
  };

  async function onPickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPickerOpen(false);
    setLoading(true);
    try {
      const features = await parseParcellaireFileToFeatures(file, {
        onTelepacXml: handleTelepacXml,
      });
      if (features === null) return; // import annulé dans le dialogue de colonne
      await finalizeImport(features, file.name);
    } catch (error) {
      console.error("[IMPORT_PARCELLAIRE]", error);
      onError?.(error);
      setReport({ type: "error", message: importErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  async function onPickFolder(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    setPickerOpen(false);
    setLoading(true);
    try {
      const parsed = await parseShapefileFilesToFeatures(files);
      const sourceName = files[0]?.webkitRelativePath || files[0]?.name || "";
      await finalizeImport(normalizeImportedFeatures(parsed, { sourceName }), sourceName);
    } catch (error) {
      console.error("[IMPORT_PARCELLAIRE_DOSSIER]", error);
      onError?.(error);
      setReport({
        type: "error",
        message:
          "Impossible de lire ce dossier. Sélectionnez un dossier contenant les fichiers " +
          "du shapefile (.shp, .dbf, .shx, .prj), zippés ou non.",
      });
    } finally {
      setLoading(false);
    }
  }

  // Post-traitement commun : ajout au draw avec un id unique garanti, signalement
  // des recouvrements, zoom sur l'emprise et synchronisation de la liste.
  async function finalizeImport(features, sourceName = "") {
    if (!features || features.length === 0) throw new Error("IMPORT_VIDE");

    const draw = drawRef?.current;
    const map = mapRef?.current;
    // Sans carte prête, l'import n'a nulle part où aller : on le dit plutôt que
    // de laisser l'utilisateur devant un écran inchangé.
    if (!draw || !map) throw new Error("CARTE_NON_PRETE");

    // Les shapefiles numérotent leurs entités par index : deux imports successifs
    // réutiliseraient les mêmes ids et draw.add() écraserait silencieusement les
    // parcelles déjà présentes. On force donc un id neuf en cas de collision.
    const existingIds = new Set(
      (draw.getAll()?.features ?? [])
        .map((feature) => feature.id)
        .filter((id) => id != null)
        .map(String)
    );
    const generateId = () => {
      let id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `imp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      while (existingIds.has(id)) id = `${id}-${Math.random().toString(36).slice(2)}`;
      return id;
    };

    for (const feature of features) {
      let id = feature.id != null ? String(feature.id) : null;
      if (id == null || existingIds.has(id)) id = generateId();
      existingIds.add(id);
      draw.add({ ...feature, id });
    }

    void resolveOverlappingParcelsAsync(draw, { mode: "warn" });

    const allFeatures = draw.getAll()?.features ?? [];
    if (zoomOnImport && allFeatures.length) {
      const bounds = computeBounds(allFeatures);
      if (bounds) {
        try {
          map.fitBounds(bounds, { padding: 48 });
        } catch {
          /* fitBounds peut échouer sur une emprise dégénérée : sans conséquence */
        }
      }
    }

    const polygons = allFeatures.filter(
      (feature) =>
        feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon"
    );
    setFeatures?.(polygons);
    if (allFeatures[0]?.id && typeof selectFeatureOnMap === "function") {
      selectFeatureOnMap(allFeatures[0].id, false);
    }

    const firstProps = features[0]?.properties || {};
    onImportMeta?.({
      pacage: firstProps.code_exploitation || firstProps.pacage || null,
      year: Number.isFinite(Number(firstProps.annee)) ? Number(firstProps.annee) : null,
    });
    onImported?.(features);

    setReport({
      type: "success",
      message:
        `${features.length} parcelle${features.length > 1 ? "s" : ""} importée` +
        `${features.length > 1 ? "s" : ""}${sourceName ? ` depuis « ${sourceName} »` : ""}.`,
      total: polygons.length,
    });
  }

  const buttonClass = [
    "fp-btn",
    variant === "primary" ? "fp-btn--primary" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={() => !disabled && !loading && setPickerOpen(true)}
        disabled={disabled || loading}
        title="Charger un parcellaire (XML Télépac, shapefile, GeoJSON, KML, GeoPackage, CSV)"
      >
        <IconUpload />
        <span>{loading ? "Import en cours…" : label}</span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        onChange={onPickFile}
        style={{ display: "none" }}
      />
      <input
        ref={(el) => {
          folderInputRef.current = el;
          // Attributs non standard : posés en propriétés DOM pour activer la
          // sélection récursive de dossier sur les navigateurs Chromium.
          if (el) {
            el.webkitdirectory = true;
            el.directory = true;
          }
        }}
        type="file"
        multiple
        onChange={onPickFolder}
        style={{ display: "none" }}
      />

      {pickerOpen && (
        <Modal
          open
          width={620}
          title="Importer un parcellaire"
          subtitle="Le format est détecté automatiquement et les coordonnées sont ramenées en WGS84. Rien n'est envoyé sur Internet."
          onClose={() => setPickerOpen(false)}
          footer={
            <button type="button" className="fp-btn" onClick={() => setPickerOpen(false)}>
              Annuler
            </button>
          }
        >
          <div style={{ display: "grid", gap: 10 }}>
            <button
              type="button"
              className="fp-btn fp-btn--primary fp-btn--lg fp-btn--block"
              onClick={() => fileInputRef.current?.click()}
            >
              <IconFile /> Choisir un fichier
            </button>
            <button
              type="button"
              className="fp-btn fp-btn--lg fp-btn--block"
              onClick={() => folderInputRef.current?.click()}
            >
              <IconFolder /> Choisir un dossier shapefile (.shp, .dbf, .shx, .prj)
            </button>
          </div>

          <div className="fp-card fp-card--muted" style={{ marginTop: 18 }}>
            <h3 className="fp-section-title">Formats acceptés</h3>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {IMPORT_FORMATS.map((format) => (
                <div key={format.id} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span className="fp-badge fp-badge--accent" style={{ minWidth: 96 }}>
                    {format.label}
                  </span>
                  <span className="fp-hint">
                    {format.description}
                    {format.limites ? (
                      <span style={{ display: "block", color: "var(--c-text-faint)" }}>
                        {format.limites}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="fp-hint" style={{ marginTop: 14 }}>
            Un nouvel import s'ajoute au parcellaire existant : vous pouvez charger
            plusieurs fichiers, y compris de millésimes différents.
          </p>
        </Modal>
      )}

      {columnDialog && (
        <ColumnSelectDialog
          fileName={columnDialog.fileName}
          suggestedOffset={columnDialog.suggestedOffset}
          onConfirm={handleColumnConfirm}
          onCancel={handleColumnCancel}
        />
      )}

      {report && (
        <Modal
          open
          width={460}
          title={report.type === "success" ? "Import terminé" : "Import impossible"}
          onClose={() => setReport(null)}
          footer={
            <button
              type="button"
              className="fp-btn fp-btn--primary"
              style={{ marginLeft: "auto" }}
              onClick={() => setReport(null)}
            >
              Fermer
            </button>
          }
        >
          <p style={{ margin: 0, fontSize: "var(--fs-md)", lineHeight: 1.6 }}>
            {report.message}
          </p>
          {report.type === "success" && report.total != null ? (
            <p className="fp-hint" style={{ marginTop: 8 }}>
              Le parcellaire compte désormais {report.total} parcelle
              {report.total > 1 ? "s" : ""}.
            </p>
          ) : null}
        </Modal>
      )}
    </>
  );
}

function computeBounds(features) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const feature of features) {
    const type = feature.geometry?.type;
    const coordinates =
      type === "Polygon"
        ? feature.geometry.coordinates.flat(1)
        : type === "MultiPolygon"
          ? feature.geometry.coordinates.flat(2)
          : [];
    for (const [lon, lat] of coordinates) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }

  if (!Number.isFinite(minLon)) return null;
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}
