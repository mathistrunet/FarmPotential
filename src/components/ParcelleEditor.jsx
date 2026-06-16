// src/components/ParcelleEditor.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import centroid from "@turf/centroid";
import {
  entriesCodebook,
  labelFromCode,
  codeFromLabel,
  splitCultureKey,
  resolvePrecisionForCode,
} from "../utils/cultureLabels";
import { featureAreaM2 } from "../utils/geometry";
import { fetchRpgGeoJSON, getCultureLabel, getMapBoundsCRS84 } from "../services/rpg";
import { RPG_MIN_ZOOM } from "../Front/useRpgLayer";
import { fetchParcelSoilGrids, fetchParcelWrb } from "../services/soilgridsBackend";
import { saveParcellesGeojson } from "../services/parcellesBackend";
import ParcelSoilPanel from "./ParcelSoilPanel";

function computeCultureWarning(raw, fallbackPrecision = "") {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  const split = splitCultureKey(value);
  const isCodeLike = /^[A-Z0-9]{2,10}$/.test(split.code);
  if (isCodeLike) {
    const precision = split.precision || String(fallbackPrecision || "").trim();
    const known = !!(labelFromCode(split.code, precision) || labelFromCode(split.code));
    if (!known) {
      return { type: "code", value: split.code };
    }
    return null;
  }
  const knownByLabel = !!codeFromLabel(value);
  if (!knownByLabel) {
    return { type: "label", value };
  }
  return null;
}

function renderCultureWarningPure(raw, precision, displayLookup) {
  if (!raw) return null;
  if (displayLookup.has(String(raw).trim().toLowerCase())) return null;
  const warn = computeCultureWarning(raw, precision);
  if (!warn) return null;
  return (
    <div style={{ fontSize: 12, color: "#a00", marginTop: 4 }}>
      "{warn.value}" n'est pas un {warn.type === "code" ? <b>code culture</b> : <b>nom de culture</b>} reconnu.
    </div>
  );
}

function parseBioFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "oui") return true;
    if (normalized === "false" || normalized === "0" || normalized === "non") return false;
  }
  return false;
}

function formatIlotParcelle(props = {}) {
  const ilot = String(props.ilot_numero ?? "").trim();
  const numero = String(props.numero ?? "").trim();
  if (ilot && numero) return `${ilot}.${numero}`;
  return ilot || numero;
}

function splitIlotParcelle(rawValue) {
  const text = String(rawValue ?? "").trim();
  if (!text) return { ilot: "", numero: "" };
  const dotIndex = text.indexOf(".");
  if (dotIndex < 0) return { ilot: text, numero: "" };
  const ilot = text.slice(0, dotIndex).trim();
  const numero = text.slice(dotIndex + 1).trim();
  return { ilot, numero };
}

const CULTURE_COLUMNS = [
  {
    id: "next1",
    label: "Culture N+1",
    targetKeys: ["cultureN_plus1", "cultureN+1", "cultureN_+1"],
  },
  {
    id: "current",
    label: "Culture N",
    targetKeys: ["cultureN", "cultureN_0", "cultureN0", "culture", "code", "code_culture", "CP_CULTU"],
  },
  {
    id: "prev1",
    label: "Culture N-1",
    targetKeys: ["cultureN_1", "cultureN1", "culture_prec", "CULT_PREC"],
  },
  {
    id: "prev2",
    label: "Culture N-2",
    targetKeys: ["cultureN_2", "cultureN2", "culture_prec2", "CULT_PREC2"],
  },
  {
    id: "prev3",
    label: "Culture N-3",
    targetKeys: ["cultureN_3", "cultureN3", "culture_prec3", "CULT_PREC3"],
  },
  {
    id: "prev4",
    label: "Culture N-4",
    targetKeys: ["cultureN_4", "cultureN4", "culture_prec4", "CULT_PREC4"],
  },
  {
    id: "prev5",
    label: "Culture N-5",
    targetKeys: ["cultureN_5", "cultureN5", "culture_prec5", "CULT_PREC5"],
  },
  {
    id: "prev6",
    label: "Culture N-6",
    targetKeys: ["cultureN_6", "cultureN6", "culture_prec6", "CULT_PREC6"],
  },
];

const PRECISION_KEYS = {
  next1: "precision_n_plus1",
  current: "precision",
  prev1: "precision_n1",
  prev2: "precision_n2",
  prev3: "precision_n3",
  prev4: "precision_n4",
  prev5: "precision_n5",
  prev6: "precision_n6",
};

const ADVANCED_COLUMNS = [
  { id: "production_semences", label: "Production semences", type: "bool" },
  { id: "production_fermiers", label: "Production fermiers", type: "bool" },
  { id: "deshydratation", label: "Deshydratation", type: "bool" },
  { id: "derogation_ukraine", label: "Derogation Ukraine", type: "bool" },
  { id: "accident_culture", label: "Accident culture", type: "bool" },
  { id: "culture_secondaire", label: "Culture secondaire", type: "text" },
  { id: "maec_elevage_monogastrique", label: "MAEC monogastrique", type: "bool" },
];

const buildEmptyTypedState = () =>
  CULTURE_COLUMNS.reduce((acc, col) => {
    acc[col.id] = {};
    return acc;
  }, {});

const RPG_AVAILABLE_YEARS = [2024, 2023, 2022, 2021, 2020, 2019, 2018];
const CULTURE_COLUMN_OFFSETS = {
  next1: 1,
  current: 0,
  prev1: -1,
  prev2: -2,
  prev3: -3,
  prev4: -4,
  prev5: -5,
  prev6: -6,
};
const RPG_BASE_YEAR_FOR_N = new Date().getFullYear();

const getRpgYearForColumn = (columnId) => {
  const offset = CULTURE_COLUMN_OFFSETS[columnId];
  if (offset == null) return null;
  return RPG_BASE_YEAR_FOR_N + offset;
};

function pointInRing(point, ring) {
  if (!Array.isArray(point) || point.length < 2) return false;
  if (!Array.isArray(ring) || ring.length < 4) return false;
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0];
    const yi = ring[i]?.[1];
    const xj = ring[j]?.[0];
    const yj = ring[j]?.[1];
    if (!Number.isFinite(xi) || !Number.isFinite(yi) || !Number.isFinite(xj) || !Number.isFinite(yj)) {
      continue;
    }
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) return false;
  if (!pointInRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(point, polygon[i])) return false;
  }
  return true;
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates?.some((poly) => pointInPolygon(point, poly));
  }
  return false;
}

function computeGeometryBbox(geometry) {
  if (!geometry) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const register = (coord) => {
    if (!Array.isArray(coord) || coord.length < 2) return;
    const x = coord[0];
    const y = coord[1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  const walkRing = (ring) => {
    if (!Array.isArray(ring)) return;
    ring.forEach(register);
  };

  const walkPolygon = (polygon) => {
    if (!Array.isArray(polygon)) return;
    polygon.forEach(walkRing);
  };

  if (geometry.type === "Polygon") {
    walkPolygon(geometry.coordinates);
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates?.forEach(walkPolygon);
  }

  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

function buildRpgIndex(features) {
  if (!Array.isArray(features)) return [];
  return features
    .map((feature) => ({ feature, bbox: computeGeometryBbox(feature?.geometry) }))
    .filter((item) => Array.isArray(item.bbox));
}

// ---------------------------------------------------------------------------
// Memoized table row — re-renders only when its own feature or typed values change
// ---------------------------------------------------------------------------
const TableRow = React.memo(function TableRow({
  feature,
  idKey,
  isSelected,
  rowParity,
  showAdvancedColumns,
  typedNext1,
  typedCurrent,
  typedPrev1,
  typedPrev2,
  typedPrev3,
  typedPrev4,
  typedPrev5,
  typedPrev6,
  onSelect,
  onUpdateField,
  onUpdateCulture,
  onRegisterRef,
  soilUpr,
  onOpenSoilDetail,
}) {
  const ref = useCallback((el) => onRegisterRef(idKey, el), [onRegisterRef, idKey]);

  const props = feature.properties || {};
  const featureArea = featureAreaM2(feature);
  const surfaceHa = typeof featureArea === "number" ? featureArea / 10000 : null;
  const isBio = parseBioFlag(props.isOrganic ?? props.conduite_bio ?? props.bio ?? props.BIO);

  const typedByColId = {
    next1: typedNext1,
    current: typedCurrent,
    prev1: typedPrev1,
    prev2: typedPrev2,
    prev3: typedPrev3,
    prev4: typedPrev4,
    prev5: typedPrev5,
    prev6: typedPrev6,
  };

  const rowStyle = {
    background: isSelected ? "#eef2ff" : rowParity === 0 ? "#fff" : "#f9fafb",
    cursor: "pointer",
  };

  const cellStyle = { padding: "6px", borderBottom: "1px solid #e5e7eb" };
  const inputStyle = { width: "100%", padding: "4px", border: "1px solid #d1d5db", borderRadius: 4 };

  return (
    <tr ref={ref} onClick={() => onSelect?.(feature.id ?? idKey)} style={rowStyle}>
      <td style={cellStyle}>
        <input
          value={formatIlotParcelle(props)}
          onChange={(e) => {
            const next = splitIlotParcelle(e.target.value);
            onUpdateField(idKey, (p) => ({ ...p, ilot_numero: next.ilot, numero: next.numero }));
          }}
          onClick={(e) => e.stopPropagation()}
          style={inputStyle}
        />
      </td>
      <td style={cellStyle}>
        <input
          value={props.nom_parcelle ?? props.NOM_PARCEL ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onUpdateField(idKey, (p) => ({
              ...p,
              nom_parcelle: val,
              NOM_PARCEL: val,
              nom_affiche: val || p.nom_affiche,
            }));
          }}
          onClick={(e) => e.stopPropagation()}
          style={inputStyle}
        />
      </td>
      <td style={{ ...cellStyle, fontSize: 13 }}>
        {surfaceHa != null && !Number.isNaN(surfaceHa) ? surfaceHa.toFixed(2) : "-"}
      </td>
      <td style={cellStyle}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={isBio}
            onChange={(e) => {
              const next = e.target.checked;
              onUpdateField(idKey, (p) => {
                const updated = { ...p };
                if (next) {
                  updated.conduite_bio = true;
                  updated.isOrganic = true;
                  if (!updated.organicType) updated.organicType = "AB";
                } else {
                  delete updated.conduite_bio;
                  delete updated.isOrganic;
                  delete updated.organicType;
                }
                return updated;
              });
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <span>AB</span>
        </label>
      </td>
      {showAdvancedColumns
        ? ADVANCED_COLUMNS.map((col) => (
            <td key={col.id} style={cellStyle}>
              {col.type === "bool" ? (
                <input
                  type="checkbox"
                  checked={parseBioFlag(props[col.id])}
                  onChange={(e) => {
                    onUpdateField(idKey, (p) => ({ ...p, [col.id]: e.target.checked }));
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <input
                  value={props[col.id] ?? ""}
                  onChange={(e) => {
                    onUpdateField(idKey, (p) => ({ ...p, [col.id]: e.target.value }));
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: "100%", padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                />
              )}
            </td>
          ))
        : null}
      {CULTURE_COLUMNS.map((col) => (
        <td key={col.id} style={cellStyle}>
          <input
            list={`cultures-col-${col.id}`}
            value={typedByColId[col.id] ?? ""}
            onChange={(e) => onUpdateCulture(col.id, idKey, e.target.value, col.targetKeys, PRECISION_KEYS[col.id])}
            onClick={(e) => e.stopPropagation()}
            style={inputStyle}
          />
        </td>
      ))}
      <td style={cellStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            value={props.type_sol ?? props.TYPE_SOL ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onUpdateField(idKey, (p) => ({ ...p, type_sol: val, TYPE_SOL: val }));
            }}
            onClick={(e) => e.stopPropagation()}
            style={inputStyle}
          />
          {soilUpr ? (
            <button
              type="button"
              title="Voir les données SoilGrids ayant servi à déduire l'UPR"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSoilDetail?.(idKey);
              }}
              style={{
                flex: "0 0 auto",
                border: "1px solid #c7d2fe",
                background: "#eef2ff",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1,
                padding: "2px 5px",
              }}
            >
              ℹ️
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
});

// ---------------------------------------------------------------------------
// Memoized card — re-renders only when its own feature or typed values change
// ---------------------------------------------------------------------------
const CardItem = React.memo(function CardItem({
  feature,
  idKey,
  isSelected,
  typedCurrent,
  typedPrev1,
  displayLookup,
  onSelect,
  onUpdateField,
  onUpdateCulture,
  onRegisterRef,
}) {
  const ref = useCallback((el) => onRegisterRef(idKey, el), [onRegisterRef, idKey]);

  const props = feature.properties || {};
  const rawId = feature.id ?? idKey;
  const featureArea = featureAreaM2(feature);
  const surfaceHa = typeof featureArea === "number" ? featureArea / 10000 : null;
  const nomParcelle = props.nom_parcelle ?? props.NOM_PARCEL ?? "";
  const typeSol = props.type_sol ?? props.TYPE_SOL ?? "";
  const ilot = (props.ilot_numero ?? "").toString().trim();
  const num = (props.numero ?? "").toString().trim();
  const titre = ilot && num ? `${ilot}.${num}` : ilot || num || "";

  const currentCol = CULTURE_COLUMNS.find((c) => c.id === "current");
  const prev1Col = CULTURE_COLUMNS.find((c) => c.id === "prev1");

  return (
    <div
      ref={ref}
      onClick={() => onSelect?.(rawId)}
      style={{
        border: isSelected ? "2px solid #2563eb" : "1px solid #ddd",
        boxShadow: isSelected ? "0 0 0 2px rgba(37,99,235,0.15)" : "none",
        borderRadius: 10,
        padding: 10,
        marginTop: 8,
        cursor: "pointer",
        transition: "box-shadow .15s ease, border-color .15s ease",
        background: "#fff",
      }}
      title="Cliquer pour selectionner la parcelle sur la carte"
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        Parcelle {titre || nomParcelle || rawId}
      </div>
      {surfaceHa != null && !Number.isNaN(surfaceHa) && (
        <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
          Surface : {surfaceHa.toFixed(2)} ha
        </div>
      )}
      {(feature.properties?.overlap_warning || feature.properties?.import_mismatch) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {feature.properties?.overlap_warning && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 999,
                background: "#fee2e2",
                color: "#991b1b",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Chevauchement detecte
            </span>
          )}
          {feature.properties?.import_mismatch && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 999,
                background: "#ffedd5",
                color: "#9a3412",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Import mismatch
            </span>
          )}
        </div>
      )}

      <label style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
        Nom de la parcelle
        <input
          value={nomParcelle}
          onChange={(e) => {
            const val = e.target.value;
            onUpdateField(idKey, (p) => ({
              ...p,
              nom_parcelle: val,
              NOM_PARCEL: val,
              nom_affiche: val || p.nom_affiche,
            }));
          }}
          onClick={(e) => e.stopPropagation()}
          placeholder="Ex. Parcelle 1"
          style={{
            width: "100%",
            padding: "4px 6px",
            border: "1px solid #ccc",
            borderRadius: 4,
            marginTop: 2,
          }}
        />
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        <label style={{ fontSize: 12, flex: "1 1 180px" }}>
          Ilot.Parcelle
          <input
            value={formatIlotParcelle(props)}
            onChange={(e) => {
              const next = splitIlotParcelle(e.target.value);
              onUpdateField(idKey, (p) => ({ ...p, ilot_numero: next.ilot, numero: next.numero }));
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Ex. 9.1"
            style={{ width: "100%", padding: "4px 6px", border: "1px solid #ccc", borderRadius: 4, marginTop: 2 }}
          />
        </label>

        <label style={{ fontSize: 12, flex: "1 1 180px" }}>
          Type de sol
          <input
            value={typeSol}
            onChange={(e) => {
              const val = e.target.value;
              onUpdateField(idKey, (p) => ({ ...p, type_sol: val, TYPE_SOL: val }));
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Ex. Argile"
            style={{ width: "100%", padding: "4px 6px", border: "1px solid #ccc", borderRadius: 4, marginTop: 2 }}
          />
        </label>
      </div>

      <label style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
        Culture (Assolia)
        <input
          list="cultures-card-current"
          value={typedCurrent}
          onChange={(e) =>
            onUpdateCulture("current", idKey, e.target.value, currentCol.targetKeys, PRECISION_KEYS.current)
          }
          onClick={(e) => e.stopPropagation()}
          placeholder="Tapez le nom (ou le code)..."
          style={{ width: "90%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, marginTop: 2 }}
        />
        {renderCultureWarningPure(typedCurrent, props?.[PRECISION_KEYS.current], displayLookup)}
      </label>

      <label style={{ fontSize: 12, display: "block" }}>
        Culture N-1
        <input
          list="cultures-card-prev1"
          value={typedPrev1}
          onChange={(e) =>
            onUpdateCulture("prev1", idKey, e.target.value, prev1Col.targetKeys, PRECISION_KEYS.prev1)
          }
          onClick={(e) => e.stopPropagation()}
          placeholder="Code ou nom"
          style={{ width: "90%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, marginTop: 2 }}
        />
        {renderCultureWarningPure(typedPrev1, props?.[PRECISION_KEYS.prev1], displayLookup)}
      </label>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ParcelleEditor({
  features,
  setFeatures,
  selectedId,
  onSelect,
  mapRef,
  onFillNames,
  isFillingNames = false,
  viewMode: externalViewMode,
}) {
  const options = useMemo(() => entriesCodebook(), []);
  const rowsRef = useRef(new Map());
  const [typed, setTyped] = useState(buildEmptyTypedState);
  const [isFillingRpg, setIsFillingRpg] = useState(false);
  const [showAdvancedColumns, setShowAdvancedColumns] = useState(false);
  const [generalInfo, setGeneralInfo] = useState({ exploitation: "", pacage: "", siret: "" });
  const [showMoveCulturesDialog, setShowMoveCulturesDialog] = useState(false);
  const [moveSrcCol, setMoveSrcCol] = useState(CULTURE_COLUMNS[0].id);
  const [moveDestCol, setMoveDestCol] = useState("");
  const [moveKeepSource, setMoveKeepSource] = useState(false);
  const [moveOverwriteDest, setMoveOverwriteDest] = useState(true);
  // Remplissage UPR depuis SoilGrids
  const [isFillingSoil, setIsFillingSoil] = useState(false);
  const [soilFillProgress, setSoilFillProgress] = useState(null); // { done, total }
  // Remplissage WRB-seul (nom de classe par parcelle) — plus léger, pour la Roumanie
  const [isFillingWrb, setIsFillingWrb] = useState(false);
  const [wrbFillProgress, setWrbFillProgress] = useState(null); // { done, total }
  // Données SoilGrids/UPR conservées le temps de la session (idKey -> payload normalisé)
  const [soilUprByIdKey, setSoilUprByIdKey] = useState({});
  // Panneau latéral de consultation (idKey ouvert)
  const [soilDetailIdKey, setSoilDetailIdKey] = useState(null);

  const resolvedViewMode = externalViewMode ?? "cards";

  const cultureOptions = useMemo(() => {
    const list = [];
    options.forEach(([key, label]) => {
      const split = splitCultureKey(key);
      if (!split.code) return;
      const display = label || split.code;
      list.push({ display, code: split.code, precision: split.precision });
    });
    return list;
  }, [options]);

  const displayLookup = useMemo(() => {
    const map = new Map();
    cultureOptions.forEach((entry) => {
      map.set(entry.display.toLowerCase(), entry);
    });
    return map;
  }, [cultureOptions]);

  const resolveCultureDisplay = useCallback((props, keys, precisionKey) => {
    const raw = keys
      .map((key) => props?.[key])
      .find((value) => value != null && String(value).trim() !== "");
    if (raw == null) return "";
    const textValue = String(raw).trim();
    const lookup = displayLookup.get(textValue.toLowerCase());
    if (lookup) {
      return lookup.display;
    }
    const fromLabel = codeFromLabel(textValue);
    const splitFromLabel = splitCultureKey(fromLabel || "");
    const splitFromValue = splitCultureKey(textValue);
    const codeFromValue = /^[A-Z0-9]{2,10}$/.test(splitFromValue.code) ? splitFromValue.code : "";
    const code = codeFromValue || splitFromLabel.code;
    if (code) {
      const candidate =
        splitFromValue.precision || splitFromLabel.precision || (precisionKey ? props?.[precisionKey] : "");
      const precision = resolvePrecisionForCode(code, candidate);
      const label = labelFromCode(code, precision) || labelFromCode(code);
      return label || code;
    }
    return textValue;
  }, [displayLookup]);

  useEffect(() => {
    if (!features.length) return;
    const props = features[0]?.properties || {};
    setGeneralInfo((prev) => {
      const next = {
        exploitation: prev.exploitation || props.exploitation || props.nom_exploitation || "",
        pacage: prev.pacage || props.code_exploitation || props.pacage || props.numero_pacage || "",
        siret: prev.siret || props.siret || props.SIRET || "",
      };
      if (
        prev.exploitation === next.exploitation &&
        prev.pacage === next.pacage &&
        prev.siret === next.siret
      ) {
        return prev;
      }
      return next;
    });
  }, [features]);

  // Stable ref registration — never changes identity
  const onRegisterRef = useCallback((idKey, el) => {
    if (el) rowsRef.current.set(idKey, el);
    else rowsRef.current.delete(idKey);
  }, []);

  useEffect(() => {
    if (selectedId == null) return;
    const el = rowsRef.current.get(String(selectedId));
    if (el?.scrollIntoView) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("row-selected");
      setTimeout(() => el.classList.remove("row-selected"), 700);
    }
  }, [selectedId, resolvedViewMode]);

  // Only rebuild typed when ids change or values are missing — not on every feature property edit
  useEffect(() => {
    setTyped((prev) => {
      const ids = features.map((f, idx) => String(f.id ?? idx));

      const firstColPrev = prev[CULTURE_COLUMNS[0].id] || {};
      const prevIds = Object.keys(firstColPrev);
      const idSet = new Set(ids);
      const prevIdSet = new Set(prevIds);

      const hasRemovedIds = prevIds.some((id) => !idSet.has(id));
      const hasNewIds = ids.some((id) => !prevIdSet.has(id));
      const hasMissingValues =
        hasNewIds ||
        CULTURE_COLUMNS.some((col) => ids.some((id) => prev[col.id]?.[id] == null));

      if (!hasMissingValues && !hasRemovedIds) return prev;

      const next = buildEmptyTypedState();
      features.forEach((f, idx) => {
        const idKey = ids[idx];
        const props = f.properties || {};
        CULTURE_COLUMNS.forEach((col) => {
          next[col.id][idKey] = resolveCultureDisplay(props, col.targetKeys, PRECISION_KEYS[col.id]);
        });
      });
      return next;
    });
  }, [features, resolveCultureDisplay]);

  const parseCultureInput = useCallback((rawValue) => {
    const value = rawValue ?? "";
    const trimmed = value.trim();
    if (!trimmed) return { display: "", code: "", precision: "" };
    const lookup = displayLookup.get(trimmed.toLowerCase());
    if (lookup) {
      const resolvedPrecision = resolvePrecisionForCode(lookup.code, lookup.precision);
      const display = labelFromCode(lookup.code, resolvedPrecision) || lookup.display;
      return { display, code: lookup.code, precision: resolvedPrecision };
    }
    const fromLabel = codeFromLabel(trimmed);
    if (fromLabel) {
      const split = splitCultureKey(fromLabel);
      const resolvedPrecision = resolvePrecisionForCode(split.code, split.precision);
      const display = labelFromCode(split.code, resolvedPrecision) || labelFromCode(split.code) || split.code;
      return { display, code: split.code, precision: resolvedPrecision };
    }
    if (/^[A-Za-z0-9]{2,10}(\|[0-9]{1,3})?$/.test(trimmed)) {
      const split = splitCultureKey(trimmed);
      const resolvedPrecision = resolvePrecisionForCode(split.code, split.precision);
      const display = labelFromCode(split.code, resolvedPrecision) || labelFromCode(split.code) || split.code;
      return { display, code: split.code, precision: resolvedPrecision };
    }
    return { display: trimmed, code: "", precision: "" };
  }, [displayLookup]);

  // Immutable feature update — finds feature by idKey and replaces only that entry
  const updateFeatureByIdKey = useCallback((idKey, propsUpdater) => {
    setFeatures((prev) => {
      const idx = prev.findIndex((f, i) => String(f.id ?? i) === idKey);
      if (idx === -1) return prev;
      const feature = prev[idx];
      const newProps = propsUpdater(feature.properties || {});
      if (newProps === feature.properties) return prev;
      const next = [...prev];
      next[idx] = { ...feature, properties: newProps };
      return next;
    });
  }, [setFeatures]);

  const updateCultureField = useCallback((colId, idKey, rawValue, targetKeys, precisionKey) => {
    const value = rawValue ?? "";
    const trimmed = value.trim();
    let display = value;

    if (trimmed === "") {
      updateFeatureByIdKey(idKey, (props) => {
        const next = { ...props };
        targetKeys.forEach((key) => { if (key in next) delete next[key]; });
        if (precisionKey && precisionKey in next) delete next[precisionKey];
        return next;
      });
      display = "";
    } else {
      const parsed = parseCultureInput(trimmed);
      if (parsed.code) {
        updateFeatureByIdKey(idKey, (props) => {
          const next = { ...props };
          targetKeys.forEach((key) => { next[key] = parsed.code; });
          if (precisionKey) {
            if (parsed.precision) {
              next[precisionKey] = parsed.precision;
            } else {
              const fallback = resolvePrecisionForCode(parsed.code, "");
              if (fallback) {
                next[precisionKey] = fallback;
              } else if (precisionKey in next) {
                delete next[precisionKey];
              }
            }
          }
          return next;
        });
        display = parsed.display;
      } else if (/^[A-Za-z0-9]{2,10}$/.test(trimmed)) {
        const upper = trimmed.toUpperCase();
        updateFeatureByIdKey(idKey, (props) => {
          const next = { ...props };
          targetKeys.forEach((key) => { next[key] = upper; });
          if (precisionKey && precisionKey in next) delete next[precisionKey];
          return next;
        });
        display = upper;
      }
    }

    setTyped((prev) => ({
      ...prev,
      [colId]: { ...(prev[colId] || {}), [idKey]: display },
    }));
  }, [updateFeatureByIdKey, parseCultureInput]);

  const fillCultureFromRpg = async (column) => {
    const targetYear = getRpgYearForColumn(column.id);
    if (!targetYear) {
      alert("Annee RPG inconnue pour cette colonne.");
      return;
    }
    if (!RPG_AVAILABLE_YEARS.includes(targetYear)) {
      alert(
        `Aucune donnee RPG ${targetYear} n'est disponible. Annees disponibles : ${RPG_AVAILABLE_YEARS.join(", ")}.`
      );
      return;
    }

    const map = mapRef?.current;
    if (!map) {
      alert("Carte indisponible pour consulter le RPG.");
      return;
    }
    if (typeof map.getZoom === "function" && map.getZoom() < RPG_MIN_ZOOM) {
      alert(`Zoome jusqu'a ${RPG_MIN_ZOOM} pour interroger le RPG.`);
      return;
    }

    setIsFillingRpg(true);
    try {
      const bbox = getMapBoundsCRS84(map);
      const gj = await fetchRpgGeoJSON(targetYear, bbox, 5000);
      const rpgFeatures = Array.isArray(gj?.features) ? gj.features : [];
      if (!rpgFeatures.length) {
        alert(`Aucune parcelle RPG ${targetYear} n'a ete trouvee dans la zone affichee.`);
        return;
      }

      const rpgIndex = buildRpgIndex(rpgFeatures);
      const nextFeatures = features.map((feature) => {
        if (!feature?.geometry) return feature;
        const center = centroid(feature)?.geometry?.coordinates;
        if (!center || !Array.isArray(center)) return feature;

        const hitEntry = rpgIndex.find((entry) => {
          const bboxEntry = entry.bbox;
          if (!bboxEntry) return false;
          const [minX, minY, maxX, maxY] = bboxEntry;
          if (center[0] < minX || center[0] > maxX || center[1] < minY || center[1] > maxY) {
            return false;
          }
          return pointInGeometry(center, entry.feature?.geometry);
        });

        if (!hitEntry) return feature;
        const { label, code } = getCultureLabel(hitEntry.feature?.properties || {});
        const resolvedKey = code || codeFromLabel(label) || label;
        const split = splitCultureKey(resolvedKey);
        const resolvedCode = split.code || resolvedKey;
        if (!resolvedCode) return feature;

        const updatedProps = { ...(feature.properties || {}) };
        column.targetKeys.forEach((key) => {
          updatedProps[key] = resolvedCode;
        });
        const precisionKey = PRECISION_KEYS[column.id];
        if (precisionKey) {
          const resolvedPrecision = resolvePrecisionForCode(resolvedCode, split.precision);
          if (resolvedPrecision) {
            updatedProps[precisionKey] = resolvedPrecision;
          }
        }

        return { ...feature, properties: updatedProps };
      });

      setFeatures(nextFeatures);

      setTyped((prev) => {
        const next = { ...prev, [column.id]: { ...(prev[column.id] || {}) } };
        nextFeatures.forEach((feature, idx) => {
          const idKey = String(feature.id ?? idx);
          const props = feature.properties || {};
          const raw = column.targetKeys
            .map((key) => props?.[key])
            .find((val) => val != null && String(val).trim() !== "");
          if (raw == null) return;
          const display = resolveCultureDisplay(props, column.targetKeys, PRECISION_KEYS[column.id]);
          next[column.id][idKey] = display;
        });
        return next;
      });
    } catch (error) {
      console.error("[RPG] Remplissage automatique echoue:", error);
      alert("Erreur lors du chargement RPG. Consulte la console pour le detail.");
    } finally {
      setIsFillingRpg(false);
    }
  };

  const resolveParcelId = (feature) =>
    String(feature?.id ?? feature?.properties?.id ?? feature?.properties?.parcelleNo ?? "");

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Récupère l'UPR d'une parcelle avec relance sur rate-limit serveur. Le 429 est désormais
  // attendu (requêtes parallèles) : on relance avec un backoff court et jitté pour étaler les
  // reprises plutôt que de les faire converger en troupeau.
  const fetchUprWithRetry = async (parcelId, attempt = 0) => {
    try {
      return await fetchParcelSoilGrids(parcelId);
    } catch (error) {
      if (attempt < 8 && /rate limit/i.test(error?.message || "")) {
        await delay(1500 + Math.random() * 1500);
        return fetchUprWithRetry(parcelId, attempt + 1);
      }
      throw error;
    }
  };

  // Nombre de remontées SoilGrids menées en parallèle. Le serveur mutualise les requêtes d'un
  // même pixel 250 m et ne compte que les vrais appels ISRIC dans son rate-limit (60/min), donc
  // une concurrence modérée sature le débit utile sans déclencher de 429 sur les exploitations
  // groupées (cas courant), tout en restant correcte pour les parcelles dispersées.
  const SOIL_FILL_CONCURRENCY = 6;

  const fillSoilTypeColumn = async () => {
    if (!Array.isArray(features) || features.length === 0) {
      alert("Aucune parcelle à analyser.");
      return;
    }
    setIsFillingSoil(true);
    setSoilFillProgress({ done: 0, total: features.length });
    try {
      // 1) Persister les parcelles côté serveur : l'endpoint SoilGrids les retrouve par id.
      await saveParcellesGeojson(features);

      let filled = 0;
      let done = 0;
      const errors = [];

      // Traitement par un pool de workers concurrents : chacun pioche la parcelle suivante dans
      // la file tant qu'il en reste. La déduplication par pixel est gérée côté serveur.
      let nextIndex = 0;
      const processOne = async (i) => {
        const feature = features[i];
        const idKey = String(feature.id ?? i);
        const parcelId = resolveParcelId(feature);
        if (parcelId) {
          try {
            const payload = await fetchUprWithRetry(parcelId);
            const code = payload?.upr?.code;
            const label = payload?.upr?.label;
            if (code) {
              const display = label ? `${code} — ${label}` : code;
              // Remplissage progressif : la cellule et son ℹ️ apparaissent dès le calcul.
              setSoilUprByIdKey((prev) => ({ ...prev, [idKey]: payload }));
              setFeatures((prev) =>
                (prev || []).map((feat, fi) => {
                  if (String(feat.id ?? fi) !== idKey) return feat;
                  return {
                    ...feat,
                    properties: { ...(feat.properties || {}), type_sol: display, TYPE_SOL: display },
                  };
                })
              );
              filled += 1;
            } else {
              errors.push(parcelId);
            }
          } catch (error) {
            console.warn(`[SOIL_FILL] Parcelle ${parcelId} échouée:`, error?.message || error);
            errors.push(parcelId);
          }
        }
        done += 1;
        setSoilFillProgress({ done, total: features.length });
      };

      const worker = async () => {
        while (nextIndex < features.length) {
          const i = nextIndex;
          nextIndex += 1;
          await processOne(i);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(SOIL_FILL_CONCURRENCY, features.length) }, () => worker())
      );

      if (errors.length) {
        alert(`${filled} parcelle(s) remplie(s). ${errors.length} sans donnée SoilGrids exploitable (point hors couverture ou identifiant manquant).`);
      }
    } catch (error) {
      console.error("[SOIL_FILL] Échec global:", error);
      alert("Erreur lors du remplissage des types de sol. Voir la console pour le détail.");
    } finally {
      setIsFillingSoil(false);
      setSoilFillProgress(null);
    }
  };

  const fetchWrbWithRetry = async (parcelId, attempt = 0) => {
    try {
      return await fetchParcelWrb(parcelId);
    } catch (error) {
      if (attempt < 8 && /rate limit/i.test(error?.message || "")) {
        await delay(1500 + Math.random() * 1500);
        return fetchWrbWithRetry(parcelId, attempt + 1);
      }
      throw error;
    }
  };

  // Remontée WRB-seule : remplit la colonne « Type de sol » avec le nom de classe WRB de chaque
  // parcelle. Beaucoup plus léger que l'UPR (un seul appel ISRIC par pixel, pas de profil ni de
  // calcul) ; suffisant pour les rendez-vous en Roumanie. La classification est best-effort côté
  // serveur (ne renvoie jamais d'erreur d'indisponibilité), donc pas de 504/500 en rafale ici.
  const fillWrbClassColumn = async () => {
    if (!Array.isArray(features) || features.length === 0) {
      alert("Aucune parcelle à analyser.");
      return;
    }
    setIsFillingWrb(true);
    setWrbFillProgress({ done: 0, total: features.length });
    try {
      await saveParcellesGeojson(features);

      let filled = 0;
      let done = 0;
      const noData = []; // réponse OK mais aucune classe WRB (hors couverture / domaine)
      const failed = []; // échec réseau réel
      let consecutiveFailures = 0;
      let aborted = false;
      const FAILURE_ABORT_THRESHOLD = 10;

      let nextIndex = 0;
      const processOne = async (i) => {
        const feature = features[i];
        const idKey = String(feature.id ?? i);
        const parcelId = resolveParcelId(feature);
        if (parcelId) {
          try {
            const payload = await fetchWrbWithRetry(parcelId);
            consecutiveFailures = 0;
            const wrb = payload?.wrbClassName;
            if (wrb) {
              setFeatures((prev) =>
                (prev || []).map((feat, fi) => {
                  if (String(feat.id ?? fi) !== idKey) return feat;
                  return {
                    ...feat,
                    properties: {
                      ...(feat.properties || {}),
                      type_sol: wrb,
                      TYPE_SOL: wrb,
                      wrb_class: wrb,
                      WRB_CLASS: wrb,
                    },
                  };
                })
              );
              filled += 1;
            } else {
              noData.push(parcelId);
            }
          } catch (error) {
            console.warn(`[WRB_FILL] Parcelle ${parcelId} échouée:`, error?.message || error);
            failed.push(parcelId);
            consecutiveFailures += 1;
            if (consecutiveFailures >= FAILURE_ABORT_THRESHOLD) aborted = true;
          }
        }
        done += 1;
        setWrbFillProgress({ done, total: features.length });
      };

      const worker = async () => {
        while (nextIndex < features.length && !aborted) {
          const i = nextIndex;
          nextIndex += 1;
          await processOne(i);
        }
      };
      // Concurrence modérée : la classification ISRIC est lente (~8 s) ; on évite de la saturer.
      const WRB_FILL_CONCURRENCY = 4;
      await Promise.all(
        Array.from({ length: Math.min(WRB_FILL_CONCURRENCY, features.length) }, () => worker())
      );

      if (aborted) {
        const remaining = features.length - done;
        alert(
          `Remontée WRB interrompue : SoilGrids ne répond pas (${failed.length} échecs consécutifs). ` +
            `${filled} parcelle(s) remplie(s), ${remaining} non traitée(s). Réessaie plus tard.`
        );
      } else if (noData.length || failed.length) {
        const parts = [];
        if (noData.length) parts.push(`${noData.length} sans classe WRB (hors couverture)`);
        if (failed.length) parts.push(`${failed.length} en échec`);
        alert(`${filled} parcelle(s) remplie(s). ${parts.join(", ")}.`);
      }
    } catch (error) {
      console.error("[WRB_FILL] Échec global:", error);
      alert("Erreur lors de la remontée WRB. Voir la console pour le détail.");
    } finally {
      setIsFillingWrb(false);
      setWrbFillProgress(null);
    }
  };

  const updateGeneralInfo = useCallback((field, value) => {
    const next = { ...generalInfo, [field]: value };
    setGeneralInfo(next);
    setFeatures((prev) =>
      (prev || []).map((feature) => {
        const props = { ...(feature?.properties || {}) };
        if (field === "exploitation") {
          props.exploitation = value;
          props.nom_exploitation = value;
        }
        if (field === "pacage") {
          props.code_exploitation = value;
          props.pacage = value;
          props.numero_pacage = value;
        }
        if (field === "siret") {
          props.siret = value;
          props.SIRET = value;
        }
        return { ...feature, properties: props };
      })
    );
  }, [generalInfo, setFeatures]);

  const renderCardView = () => (
    <>
      {/* Shared datalists for cards — one per column instead of one per card */}
      <datalist id="cultures-card-current">
        {cultureOptions.map((opt) => (
          <option key={`${opt.code}-${opt.precision || ""}-${opt.display}`} value={opt.display}>
            {opt.code}
          </option>
        ))}
      </datalist>
      <datalist id="cultures-card-prev1">
        {cultureOptions.map((opt) => (
          <option key={`${opt.code}-${opt.precision || ""}-${opt.display}`} value={opt.display}>
            {opt.code}
          </option>
        ))}
      </datalist>
      {features.map((f, idx) => {
        const rawId = f.id ?? idx;
        const idKey = String(rawId);
        return (
          <CardItem
            key={idKey}
            feature={f}
            idKey={idKey}
            isSelected={String(selectedId) === idKey}
            typedCurrent={typed.current?.[idKey] ?? ""}
            typedPrev1={typed.prev1?.[idKey] ?? ""}
            displayLookup={displayLookup}
            onSelect={onSelect}
            onUpdateField={updateFeatureByIdKey}
            onUpdateCulture={updateCultureField}
            onRegisterRef={onRegisterRef}
          />
        );
      })}
    </>
  );

  const applyMoveCultures = () => {
    const srcDef = CULTURE_COLUMNS.find((c) => c.id === moveSrcCol);
    const destDef = moveDestCol ? CULTURE_COLUMNS.find((c) => c.id === moveDestCol) : null;
    if (!srcDef) return;

    setFeatures((prev) =>
      prev.map((feature) => {
        const props = { ...(feature.properties || {}) };
        const srcKey = srcDef.targetKeys[0];
        const srcPrecKey = PRECISION_KEYS[srcDef.id];
        const srcValue = props[srcKey];
        const srcPrec = props[srcPrecKey];

        if (destDef) {
          const destKey = destDef.targetKeys[0];
          const destPrecKey = PRECISION_KEYS[destDef.id];
          const destHasValue = props[destKey] != null && String(props[destKey]).trim() !== "";
          if (moveOverwriteDest || !destHasValue) {
            if (srcValue != null && String(srcValue).trim() !== "") {
              props[destKey] = srcValue;
              destDef.targetKeys.slice(1).forEach((k) => { props[k] = srcValue; });
              if (srcPrec != null) props[destPrecKey] = srcPrec;
              else delete props[destPrecKey];
            } else {
              destDef.targetKeys.forEach((k) => { delete props[k]; });
              delete props[destPrecKey];
            }
          }
        }

        if (!moveKeepSource) {
          srcDef.targetKeys.forEach((k) => { delete props[k]; });
          delete props[srcPrecKey];
        }

        return { ...feature, properties: props };
      })
    );

    setTyped((prev) => {
      const next = { ...prev };
      if (!moveKeepSource) {
        next[srcDef.id] = {};
      }
      if (destDef) {
        next[destDef.id] = {};
      }
      return next;
    });

    setShowMoveCulturesDialog(false);
  };

  const renderMoveCulturesDialog = () => {
    if (!showMoveCulturesDialog) return null;
    const overlayStyle = {
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
    };
    const dialogStyle = {
      background: "#fff", borderRadius: 10, padding: 24, width: 400,
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 14,
    };
    const labelStyle = { fontSize: 13, fontWeight: 500, display: "flex", flexDirection: "column", gap: 4 };
    const selectStyle = { padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 };
    const rowStyle = { display: "flex", alignItems: "center", gap: 8, fontSize: 13 };

    const srcIsValid = !!moveSrcCol;
    const destIsDifferent = !moveDestCol || moveDestCol !== moveSrcCol;
    const canApply = srcIsValid && destIsDifferent;

    return (
      <div style={overlayStyle} onClick={() => setShowMoveCulturesDialog(false)}>
        <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Déplacer / supprimer cultures</div>

          <label style={labelStyle}>
            Colonne source (données à déplacer)
            <select value={moveSrcCol} onChange={(e) => setMoveSrcCol(e.target.value)} style={selectStyle}>
              {CULTURE_COLUMNS.map((col) => (
                <option key={col.id} value={col.id}>{col.label}</option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Colonne destination <span style={{ fontWeight: 400, color: "#666" }}>(laisser vide pour supprimer sans déplacer)</span>
            <select value={moveDestCol} onChange={(e) => setMoveDestCol(e.target.value)} style={selectStyle}>
              <option value="">— Aucune destination (suppression) —</option>
              {CULTURE_COLUMNS.filter((c) => c.id !== moveSrcCol).map((col) => (
                <option key={col.id} value={col.id}>{col.label}</option>
              ))}
            </select>
          </label>

          <label style={rowStyle}>
            <input type="checkbox" checked={moveKeepSource} onChange={(e) => setMoveKeepSource(e.target.checked)} />
            Conserver les données dans la colonne source
          </label>

          {moveDestCol && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#374151" }}>Données destination :</div>
              <label style={rowStyle}>
                <input type="radio" name="overwrite" checked={moveOverwriteDest} onChange={() => setMoveOverwriteDest(true)} />
                Écraser les données existantes
              </label>
              <label style={{ ...rowStyle, marginTop: 4 }}>
                <input type="radio" name="overwrite" checked={!moveOverwriteDest} onChange={() => setMoveOverwriteDest(false)} />
                Compléter seulement les cellules vides
              </label>
            </div>
          )}

          {!destIsDifferent && (
            <div style={{ fontSize: 12, color: "#dc2626" }}>La colonne source et destination doivent être différentes.</div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              onClick={() => setShowMoveCulturesDialog(false)}
              style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer", fontSize: 13 }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={applyMoveCultures}
              disabled={!canApply}
              style={{
                padding: "7px 16px", borderRadius: 6, border: "none",
                background: canApply ? "#2563eb" : "#93c5fd", color: "#fff",
                cursor: canApply ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600,
              }}
            >
              {moveDestCol ? "Déplacer" : "Supprimer"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderTableView = () => {
    const headerStyle = {
      padding: "8px 6px",
      borderBottom: "1px solid #e5e7eb",
      background: "#f3f4f6",
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: "0.02em",
      textAlign: "left",
      color: "#374151",
    };

    const headerButtonStyle = {
      marginTop: 4,
      padding: "2px 6px",
      borderRadius: 4,
      border: "1px solid #d1d5db",
      background: "#fff",
      fontSize: 11,
      cursor: "pointer",
    };

    return (
      <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              setMoveSrcCol(CULTURE_COLUMNS[0].id);
              setMoveDestCol("");
              setMoveKeepSource(false);
              setMoveOverwriteDest(true);
              setShowMoveCulturesDialog(true);
            }}
            style={{
              padding: "7px 14px", borderRadius: 6, border: "1px solid #6366f1",
              background: "#eef2ff", color: "#4338ca", cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}
          >
            Déplacer cultures
          </button>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fff" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Informations exploitation</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
            <label style={{ fontSize: 12 }}>
              Exploitation
              <input
                value={generalInfo.exploitation}
                onChange={(e) => updateGeneralInfo("exploitation", e.target.value)}
                style={{ width: "100%", padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4, marginTop: 2 }}
              />
            </label>
            <label style={{ fontSize: 12 }}>
              Numero pacage
              <input
                value={generalInfo.pacage}
                onChange={(e) => updateGeneralInfo("pacage", e.target.value)}
                style={{ width: "100%", padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4, marginTop: 2 }}
              />
            </label>
            <label style={{ fontSize: 12 }}>
              SIRET
              <input
                value={generalInfo.siret}
                onChange={(e) => updateGeneralInfo("siret", e.target.value)}
                style={{ width: "100%", padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4, marginTop: 2 }}
              />
            </label>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          {/* Shared datalists — one per culture column, not one per row */}
          {CULTURE_COLUMNS.map((col) => (
            <datalist key={col.id} id={`cultures-col-${col.id}`}>
              {cultureOptions.map((opt) => (
                <option key={`${opt.code}-${opt.precision || ""}-${opt.display}`} value={opt.display}>
                  {opt.code}
                </option>
              ))}
            </datalist>
          ))}
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
            <thead>
              <tr>
                <th style={headerStyle}>Ilot.Parcelle</th>
                <th style={headerStyle}>
                  <div>Nom</div>
                  {onFillNames ? (
                    <button
                      type="button"
                      onClick={() => onFillNames()}
                      disabled={isFillingNames}
                      style={{
                        ...headerButtonStyle,
                        opacity: isFillingNames ? 0.6 : 1,
                        cursor: isFillingNames ? "not-allowed" : "pointer",
                      }}
                    >
                      {isFillingNames ? "Remplissage..." : "Remplir"}
                    </button>
                  ) : null}
                </th>
                <th style={headerStyle}>Surface (ha)</th>
                <th style={headerStyle}>Bio</th>
                {showAdvancedColumns
                  ? ADVANCED_COLUMNS.map((col) => (
                      <th key={col.id} style={headerStyle}>{col.label}</th>
                    ))
                  : null}
                {CULTURE_COLUMNS.map((col) => (
                  <th key={col.id} style={headerStyle}>
                    <div
                      onClick={
                        col.id === "current"
                          ? () => setShowAdvancedColumns((prev) => !prev)
                          : undefined
                      }
                      title={
                        col.id === "current"
                          ? showAdvancedColumns
                            ? "Masquer les options semences/fermiere/etc."
                            : "Afficher les options semences/fermiere/etc."
                          : undefined
                      }
                      style={{
                        cursor: col.id === "current" ? "pointer" : "default",
                        fontWeight: 600,
                      }}
                    >
                      {col.label}
                      {col.id === "current" ? (showAdvancedColumns ? " [-]" : " [+]") : ""}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fillCultureFromRpg(col);
                      }}
                      disabled={isFillingRpg}
                      style={{
                        ...headerButtonStyle,
                        opacity: isFillingRpg ? 0.6 : 1,
                        cursor: isFillingRpg ? "not-allowed" : "pointer",
                      }}
                    >
                      {isFillingRpg ? "Remplissage..." : "Remplir"}
                    </button>
                  </th>
                ))}
                <th style={headerStyle}>
                  <div style={{ fontWeight: 600 }}>Type de sol</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fillSoilTypeColumn();
                    }}
                    disabled={isFillingSoil}
                    title="Déduire l'UPR de chaque parcelle depuis SoilGrids (texture, RU, WRB)"
                    style={{
                      ...headerButtonStyle,
                      opacity: isFillingSoil ? 0.6 : 1,
                      cursor: isFillingSoil ? "not-allowed" : "pointer",
                    }}
                  >
                    {isFillingSoil
                      ? soilFillProgress
                        ? `Remplissage ${soilFillProgress.done}/${soilFillProgress.total}`
                        : "Remplissage..."
                      : "Remplir la colonne"}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fillWrbClassColumn();
                    }}
                    disabled={isFillingWrb || isFillingSoil}
                    title="Remonter uniquement le nom de classe WRB par parcelle (plus léger, dédup par pixel)"
                    style={{
                      ...headerButtonStyle,
                      marginTop: 4,
                      opacity: isFillingWrb || isFillingSoil ? 0.6 : 1,
                      cursor: isFillingWrb || isFillingSoil ? "not-allowed" : "pointer",
                    }}
                  >
                    {isFillingWrb
                      ? wrbFillProgress
                        ? `WRB ${wrbFillProgress.done}/${wrbFillProgress.total}`
                        : "Remplissage..."
                      : "Remplir WRB"}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((f, idx) => {
                const idKey = String(f.id ?? idx);
                return (
                  <TableRow
                    key={idKey}
                    feature={f}
                    idKey={idKey}
                    isSelected={String(selectedId) === idKey}
                    rowParity={idx % 2}
                    showAdvancedColumns={showAdvancedColumns}
                    typedNext1={typed.next1?.[idKey] ?? ""}
                    typedCurrent={typed.current?.[idKey] ?? ""}
                    typedPrev1={typed.prev1?.[idKey] ?? ""}
                    typedPrev2={typed.prev2?.[idKey] ?? ""}
                    typedPrev3={typed.prev3?.[idKey] ?? ""}
                    typedPrev4={typed.prev4?.[idKey] ?? ""}
                    typedPrev5={typed.prev5?.[idKey] ?? ""}
                    typedPrev6={typed.prev6?.[idKey] ?? ""}
                    onSelect={onSelect}
                    onUpdateField={updateFeatureByIdKey}
                    onUpdateCulture={updateCultureField}
                    onRegisterRef={onRegisterRef}
                    soilUpr={soilUprByIdKey[idKey]}
                    onOpenSoilDetail={setSoilDetailIdKey}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const soilDetailFeature = useMemo(() => {
    if (soilDetailIdKey == null) return null;
    const list = features || [];
    for (let i = 0; i < list.length; i += 1) {
      if (String(list[i].id ?? i) === String(soilDetailIdKey)) return list[i];
    }
    return null;
  }, [soilDetailIdKey, features]);
  const soilDetailPayload = soilDetailIdKey != null ? soilUprByIdKey[soilDetailIdKey] : null;

  return (
    <div style={{ marginTop: 12 }}>
      {resolvedViewMode === "cards" ? renderCardView() : renderTableView()}
      {renderMoveCulturesDialog()}
      {soilDetailFeature && soilDetailPayload ? (
        <ParcelSoilPanel
          parcel={soilDetailFeature}
          soilState={{ data: soilDetailPayload, loading: false, error: null, cacheHit: false }}
          onClose={() => setSoilDetailIdKey(null)}
          onRefresh={async () => {
            const parcelId = resolveParcelId(soilDetailFeature);
            if (!parcelId) return;
            try {
              const payload = await fetchParcelSoilGrids(parcelId, { refresh: true });
              setSoilUprByIdKey((prev) => ({ ...prev, [soilDetailIdKey]: payload }));
            } catch (error) {
              console.warn("[SOIL_DETAIL] Rafraîchissement échoué:", error?.message || error);
            }
          }}
        />
      ) : null}
    </div>
  );
}
