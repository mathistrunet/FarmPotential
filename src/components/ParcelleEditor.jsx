// src/components/ParcelleEditor.jsx
import React, { useEffect, useRef, useState } from "react";
import centroid from "@turf/centroid";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import {
  entriesCodebook,
  labelFromCode,
  codeFromLabel,
} from "../utils/cultureLabels";
import { featureAreaM2 } from "../utils/geometry";
import { fetchRpgGeoJSON, getCultureLabel } from "../services/rpg";

const DEFAULT_POLYGON_FILL = "#18A0FB";
const DEFAULT_POLYGON_LINE = "#0066CC";
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const CULTURE_FIELDS = [
  {
    field: "cultureN",
    label: "Culture N",
    propKey: "cultureN",
    placeholders: ["cultureN", "code", "CULTURE"],
    syncCode: true,
    rpgOffset: 0,
  },
  {
    field: "cultureN_1",
    label: "Culture N1",
    propKey: "cultureN_1",
    placeholders: ["cultureN_1", "cultureN1", "culture_prec"],
    rpgOffset: 1,
  },
  {
    field: "cultureN_2",
    label: "Culture N2",
    propKey: "cultureN_2",
    placeholders: ["cultureN_2", "cultureN2"],
    rpgOffset: 2,
  },
  {
    field: "cultureN_3",
    label: "Culture N3",
    propKey: "cultureN_3",
    placeholders: ["cultureN_3", "cultureN3"],
    rpgOffset: 3,
  },
  {
    field: "cultureN_4",
    label: "Culture N4",
    propKey: "cultureN_4",
    placeholders: ["cultureN_4", "cultureN4"],
    rpgOffset: 4,
  },
  {
    field: "cultureN_5",
    label: "Culture N5",
    propKey: "cultureN_5",
    placeholders: ["cultureN_5", "cultureN5"],
    rpgOffset: 5,
  },
  {
    field: "cultureN_6",
    label: "Culture N6",
    propKey: "cultureN_6",
    placeholders: ["cultureN_6", "cultureN6"],
    rpgOffset: 6,
  },
];

const TABLE_CELL_PADDING = "4px 6px";

function expandShortHex(value) {
  if (value.length !== 4) return value;
  const [, r, g, b] = value;
  return `#${r}${r}${g}${g}${b}${b}`;
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!HEX_COLOR_RE.test(trimmed)) return fallback;
  return trimmed.length === 4 ? expandShortHex(trimmed) : trimmed;
}

function normalizePart(raw) {
  if (raw == null) return "";
  return String(raw).trim();
}

function buildParcelleValue(ilot, numero) {
  const ilotPart = normalizePart(ilot);
  const numeroPart = normalizePart(numero);
  return `${ilotPart}.${numeroPart}`;
}

function parseParcelleInput(rawValue) {
  const str = rawValue == null ? "" : String(rawValue);
  const [first, ...rest] = str.split(".");
  return {
    ilot: first ?? "",
    numero: rest.length > 0 ? rest.join(".") : "",
  };
}

function normalizeDisplayValue(raw) {
  if (raw == null) return "";
  const str = String(raw).trim();
  if (!str) return "";
  const label = labelFromCode(str);
  if (label) return label;
  const labelFromUpper = labelFromCode(str.toUpperCase());
  if (labelFromUpper) return labelFromUpper;
  return str;
}

function getCultureWarning(value) {
  const raw = value == null ? "" : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const len = trimmed.replace(/\s+/g, "").length;
  if (len < 3) return null;
  if (len === 3) {
    const asCode = trimmed.toUpperCase();
    if (!labelFromCode(asCode)) {
      return `“${asCode}” n’est pas un code culture reconnu.`;
    }
    return null;
  }
  if (!codeFromLabel(trimmed)) {
    return `“${trimmed}” n’est pas un nom de culture reconnu.`;
  }
  return null;
}

function parseYearValue(raw) {
  if (raw == null) return null;
  const year = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(year) || year < 1990 || year > 2100) return null;
  return year;
}

function updateBounds(bounds, position) {
  if (!Array.isArray(position) || position.length < 2) return bounds;
  const [lon, lat] = position;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return bounds;
  const next = bounds || [lon, lat, lon, lat];
  next[0] = Math.min(next[0], lon);
  next[1] = Math.min(next[1], lat);
  next[2] = Math.max(next[2], lon);
  next[3] = Math.max(next[3], lat);
  return next;
}

function bboxFromGeometry(geometry) {
  if (!geometry?.coordinates) return null;
  let bounds = null;
  const visit = (coords) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      bounds = updateBounds(bounds, coords);
      return;
    }
    coords.forEach((entry) => visit(entry));
  };
  visit(geometry.coordinates);
  return bounds;
}

function mergeBbox(a, b) {
  if (!a) return b;
  if (!b) return a;
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

function pickFirstValue(props, keys) {
  if (!props) return "";
  for (const key of keys) {
    if (props[key] != null && String(props[key]).trim() !== "") {
      return props[key];
    }
  }
  return "";
}

function resolveTypeSol(props) {
  return pickFirstValue(props, ["type_sol", "typeSol", "type_de_sol", "sol"]);
}

function parseParcelleBioValue(rawValue) {
  if (rawValue == null) return false;
  const normalized = String(rawValue).trim().toLowerCase();
  if (!normalized) return false;
  return ["1", "true", "oui", "yes", "y"].includes(normalized);
}

function formatParcelleBioValue(checked) {
  return checked ? "Oui" : "Non";
}

export default function ParcelleEditor({
  features,
  setFeatures,
  selectedId,
  onSelect,
  drawRef,
  viewMode = "cards",
  csvValues,
  onCsvValuesChange,
}) {
  const options = entriesCodebook();
  const rowsRef = useRef(new Map());
  const parcelleInputRefs = useRef(new Map());
  const [typed, setTyped] = useState({});
  const [editingParcelleId, setEditingParcelleId] = useState(null);
  const [rpgLoadingField, setRpgLoadingField] = useState(null);
  const baseCultureYearRef = useRef(null);

  useEffect(() => {
    if (!selectedId) return;
    const el = rowsRef.current.get(selectedId);
    if (el?.scrollIntoView) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("row-selected");
      setTimeout(() => el.classList.remove("row-selected"), 700);
    }
  }, [selectedId]);

  useEffect(() => {
    if (editingParcelleId == null) return;
    const input = parcelleInputRefs.current.get(editingParcelleId);
    if (input?.focus) {
      input.focus();
      if (input.select) input.select();
    }
  }, [editingParcelleId]);

  useEffect(() => {
    if (viewMode !== "cards") {
      setEditingParcelleId(null);
    }
  }, [viewMode]);

  useEffect(() => {
    setTyped((prev) => {
      const next = {};
      features.forEach((f, idx) => {
        const id = f.id || idx;
        const prevRow = prev[id] || {};
        const props = f.properties || {};
        next[id] = CULTURE_FIELDS.reduce((acc, field) => {
          if (prevRow[field.field] !== undefined) {
            acc[field.field] = prevRow[field.field];
            return acc;
          }
          const rawValue = pickFirstValue(props, field.placeholders);
          acc[field.field] = normalizeDisplayValue(rawValue);
          return acc;
        }, {});
      });
      return next;
    });
  }, [features]);

  const datalistId = "cultures-master-list";

  const updateParcelleParts = (index, rawValue, { enforceNumero = false } = {}) => {
    const { ilot, numero } = parseParcelleInput(rawValue);
    const nextIlot = normalizePart(ilot);
    let nextNumero = normalizePart(numero);
    if (enforceNumero && !nextNumero) {
      nextNumero = "1";
    }

    const nextFeatures = [...features];
    const feature = nextFeatures[index];
    if (!feature) return;

    const prevProps = feature.properties || {};
    const prevIlot = normalizePart(prevProps.ilot_numero);
    const prevNumero = normalizePart(prevProps.numero);

    if (prevIlot === nextIlot && prevNumero === nextNumero) {
      return;
    }

    const nextProps = { ...prevProps };
    if (nextIlot) nextProps.ilot_numero = nextIlot;
    else delete nextProps.ilot_numero;
    if (nextNumero) nextProps.numero = nextNumero;
    else delete nextProps.numero;

    nextFeatures[index] = { ...feature, properties: nextProps };
    setFeatures(nextFeatures);
  };

  const updateNomValue = (index, rawValue, { trim = false } = {}) => {
    const nextFeatures = [...features];
    const feature = nextFeatures[index];
    if (!feature) return;

    const nextProps = { ...(feature.properties || {}) };
    const nextValue = trim ? rawValue.trim() : rawValue;
    if (nextValue) nextProps.nom = nextValue;
    else delete nextProps.nom;

    const prevValue = feature.properties?.nom;
    if (prevValue === nextProps.nom) return;

    nextFeatures[index] = { ...feature, properties: nextProps };
    setFeatures(nextFeatures);
  };

  const handleCultureChange = (id, index, field, rawValue) => {
    const config = CULTURE_FIELDS.find((item) => item.field === field);
    if (!config) return;
    const trimmed = rawValue.trim();
    let displayValue = rawValue;

    const nextFeatures = [...features];
    const feature = nextFeatures[index];
    if (feature) {
      const propKey = config.propKey;
      const nextProps = { ...(feature.properties || {}) };
      let shouldUpdate = false;

      if (!trimmed) {
        displayValue = "";
        if (propKey in nextProps) {
          delete nextProps[propKey];
          shouldUpdate = true;
        }
        if (config.syncCode && "code" in nextProps) {
          delete nextProps.code;
          shouldUpdate = true;
        }
      } else {
        const exactCode = codeFromLabel(trimmed);
        if (exactCode) {
          nextProps[propKey] = exactCode;
          if (config.syncCode) nextProps.code = exactCode;
          displayValue = labelFromCode(exactCode) || exactCode;
          shouldUpdate = true;
        } else if (/^[A-Za-z0-9]{2,10}$/.test(trimmed)) {
          const upper = trimmed.toUpperCase();
          nextProps[propKey] = upper;
          if (config.syncCode) nextProps.code = upper;
          displayValue = upper;
          shouldUpdate = true;
        }
      }

      if (shouldUpdate) {
        nextFeatures[index] = { ...feature, properties: nextProps };
        setFeatures(nextFeatures);
      }
    }

    setTyped((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: displayValue },
    }));
  };

  const updateTypeSol = (index, rawValue, { trim = false } = {}) => {
    const nextFeatures = [...features];
    const feature = nextFeatures[index];
    if (!feature) return;

    const nextProps = { ...(feature.properties || {}) };
    const nextValue = trim ? rawValue.trim() : rawValue;
    if (nextValue) nextProps.type_sol = nextValue;
    else delete nextProps.type_sol;

    const prevValue = feature.properties?.type_sol;
    if (prevValue === nextProps.type_sol) return;

    nextFeatures[index] = { ...feature, properties: nextProps };
    setFeatures(nextFeatures);
  };

  const updateParcelleBio = (index, checked) => {
    const nextFeatures = [...features];
    const feature = nextFeatures[index];
    if (!feature) return;

    const nextProps = { ...(feature.properties || {}) };
    nextProps.parcelle_bio = formatParcelleBioValue(checked);

    if (feature.properties?.parcelle_bio === nextProps.parcelle_bio) return;

    nextFeatures[index] = { ...feature, properties: nextProps };
    setFeatures(nextFeatures);
  };

  const updateFeatureProperty = (index, propKey, rawValue, { trim = false } = {}) => {
    const nextFeatures = [...features];
    const feature = nextFeatures[index];
    if (!feature) return;

    const nextProps = { ...(feature.properties || {}) };
    const nextValue = trim ? String(rawValue ?? "").trim() : rawValue;
    if (nextValue) nextProps[propKey] = nextValue;
    else delete nextProps[propKey];

    if (feature.properties?.[propKey] === nextProps[propKey]) return;

    nextFeatures[index] = { ...feature, properties: nextProps };
    setFeatures(nextFeatures);

    const draw = drawRef?.current;
    if (draw && feature.id) {
      draw.setFeatureProperty(feature.id, propKey, nextProps[propKey] || undefined);
    }
  };

  const updateFeatureColor = (index, propKey, rawValue) => {
    const nextFeatures = [...features];
    const feature = nextFeatures[index];
    if (!feature) return;

    const nextProps = { ...(feature.properties || {}) };
    if (rawValue) nextProps[propKey] = rawValue;
    else delete nextProps[propKey];

    if (feature.properties?.[propKey] === nextProps[propKey]) return;

    nextFeatures[index] = { ...feature, properties: nextProps };
    setFeatures(nextFeatures);

    const draw = drawRef?.current;
    if (draw && feature.id) {
      draw.setFeatureProperty(feature.id, propKey, nextProps[propKey] || undefined);
    }
  };

  const resetFeatureColors = (index) => {
    const nextFeatures = [...features];
    const feature = nextFeatures[index];
    if (!feature) return;

    const nextProps = { ...(feature.properties || {}) };
    delete nextProps.color;
    delete nextProps.outlineColor;

    if (
      feature.properties?.color === nextProps.color
      && feature.properties?.outlineColor === nextProps.outlineColor
    ) {
      return;
    }

    nextFeatures[index] = { ...feature, properties: nextProps };
    setFeatures(nextFeatures);

    const draw = drawRef?.current;
    if (draw && feature.id) {
      draw.setFeatureProperty(feature.id, "color", undefined);
      draw.setFeatureProperty(feature.id, "outlineColor", undefined);
    }
  };

  const renderWarning = (value) => {
    const message = getCultureWarning(value);
    if (!message) return null;
    return (
      <div style={{ fontSize: 11, color: "#a00", marginTop: 4 }}>{message}</div>
    );
  };

  const getBaseCultureYear = () => {
    if (baseCultureYearRef.current != null) return baseCultureYearRef.current;
    const input = window.prompt(
      "Indique l'année de référence de Culture N (ex: 2024)."
    );
    const year = parseYearValue(input);
    if (year != null) baseCultureYearRef.current = year;
    return year;
  };

  const handleFillRpgColumn = async (fieldConfig) => {
    if (!fieldConfig || !Number.isFinite(fieldConfig.rpgOffset)) return;
    if (rpgLoadingField) return;
    setRpgLoadingField(fieldConfig.field);

    try {
      const updates = new Map();
      const yearGroups = new Map();
      let baseYear = baseCultureYearRef.current;

      features.forEach((feature, index) => {
        const featureYear = parseYearValue(feature.properties?.annee);
        if (featureYear != null) {
          const targetYear = featureYear - fieldConfig.rpgOffset;
          if (Number.isFinite(targetYear)) {
            if (!yearGroups.has(targetYear)) yearGroups.set(targetYear, []);
            yearGroups.get(targetYear).push({ feature, index });
          }
          return;
        }

        if (baseYear == null) baseYear = getBaseCultureYear();
        if (baseYear == null) return;

        const targetYear = baseYear - fieldConfig.rpgOffset;
        if (Number.isFinite(targetYear)) {
          if (!yearGroups.has(targetYear)) yearGroups.set(targetYear, []);
          yearGroups.get(targetYear).push({ feature, index });
        }
      });

      if (!yearGroups.size) {
        alert(
          "Aucune parcelle n'a d'année de référence pour remplir cette colonne."
        );
        return;
      }

      for (const [targetYear, group] of yearGroups.entries()) {
        let combinedBbox = null;
        group.forEach(({ feature }) => {
          const bbox = bboxFromGeometry(feature.geometry);
          combinedBbox = mergeBbox(combinedBbox, bbox);
        });
        if (!combinedBbox) continue;

        let rpgData = null;
        try {
          rpgData = await fetchRpgGeoJSON(targetYear, combinedBbox);
        } catch (error) {
          console.error("Erreur RPG", error);
          alert(
            `Impossible de charger le RPG ${targetYear}. Vérifie la connexion et réessaie.`
          );
          return;
        }

        const rpgFeatures = Array.isArray(rpgData?.features)
          ? rpgData.features
          : [];
        if (!rpgFeatures.length) continue;

        group.forEach(({ feature, index }) => {
          const point = centroid(feature);
          const match = rpgFeatures.find((rpgFeature) =>
            booleanPointInPolygon(point, rpgFeature)
          );
          if (!match) return;
          const { label, code } = getCultureLabel(match.properties || {});
          const rawValue = code || label || "";
          if (!rawValue) return;
          updates.set(index, rawValue);
        });
      }

      if (!updates.size) {
        alert("Aucun précédent RPG détecté pour cette colonne.");
        return;
      }

      const nextFeatures = [...features];
      let nextTyped = { ...typed };
      updates.forEach((rawValue, index) => {
        const feature = nextFeatures[index];
        if (!feature) return;
        const id = feature.id || index;
        const nextProps = { ...(feature.properties || {}) };
        nextProps[fieldConfig.propKey] = rawValue;
        if (fieldConfig.syncCode) nextProps.code = rawValue;
        nextFeatures[index] = { ...feature, properties: nextProps };
        nextTyped = {
          ...nextTyped,
          [id]: {
            ...(nextTyped[id] || {}),
            [fieldConfig.field]: normalizeDisplayValue(rawValue),
          },
        };
        const draw = drawRef?.current;
        if (draw && feature.id) {
          draw.setFeatureProperty(feature.id, fieldConfig.propKey, rawValue);
          if (fieldConfig.syncCode) {
            draw.setFeatureProperty(feature.id, "code", rawValue);
          }
        }
      });

      setFeatures(nextFeatures);
      setTyped(nextTyped);
    } finally {
      setRpgLoadingField(null);
    }
  };

  if (viewMode === "table") {
    return (
      <div style={{ marginTop: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            Secteur
            <input
              type="text"
              value={csvValues?.secteur ?? ""}
              onChange={(e) =>
                onCsvValuesChange?.({
                  ...(csvValues || {}),
                  secteur: e.target.value,
                })
              }
              placeholder="Secteur"
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 12,
              }}
            />
          </label>
          <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            Exploitation (nom)
            <input
              type="text"
              value={csvValues?.exploitation ?? ""}
              onChange={(e) =>
                onCsvValuesChange?.({
                  ...(csvValues || {}),
                  exploitation: e.target.value,
                })
              }
              placeholder="Nom de l'exploitation"
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 12,
              }}
            />
          </label>
          <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            Numero pacage
            <input
              type="text"
              value={csvValues?.codeExploitation ?? ""}
              onChange={(e) =>
                onCsvValuesChange?.({
                  ...(csvValues || {}),
                  codeExploitation: e.target.value,
                })
              }
              placeholder="Numero pacage"
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 12,
              }}
            />
          </label>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 1520,
              borderCollapse: "collapse",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              overflow: "hidden",
              tableLayout: "fixed",
            }}
          >
            <thead style={{ background: "#f3f4f6" }}>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: TABLE_CELL_PADDING,
                    fontSize: 12,
                    width: 90,
                    whiteSpace: "nowrap",
                  }}
                >
                  Parcelle
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: TABLE_CELL_PADDING,
                    fontSize: 12,
                    width: 200,
                  }}
                >
                  Nom
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: TABLE_CELL_PADDING,
                    fontSize: 12,
                    width: 80,
                    whiteSpace: "nowrap",
                  }}
                >
                  Surface (ha)
                </th>
                <th
                  style={{
                    textAlign: "center",
                    padding: TABLE_CELL_PADDING,
                    fontSize: 12,
                    width: 80,
                    whiteSpace: "nowrap",
                  }}
                >
                  Année
                </th>
                <th
                  style={{
                    textAlign: "center",
                    padding: TABLE_CELL_PADDING,
                    fontSize: 12,
                    width: 110,
                    whiteSpace: "nowrap",
                  }}
                >
                  Parcelle Bio
                </th>
                {CULTURE_FIELDS.map((field) => (
                  <th
                    key={field.field}
                    style={{
                      textAlign: "left",
                      padding: TABLE_CELL_PADDING,
                      fontSize: 12,
                      width: 150,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {field.label}
                  </th>
                ))}
                <th
                  style={{
                    textAlign: "left",
                    padding: TABLE_CELL_PADDING,
                    fontSize: 12,
                    width: 160,
                    whiteSpace: "nowrap",
                  }}
                >
                  Type de sol
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: TABLE_CELL_PADDING,
                    fontSize: 12,
                    width: 170,
                    whiteSpace: "nowrap",
                  }}
                >
                  Couleurs
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: TABLE_CELL_PADDING,
                    fontSize: 12,
                    width: 140,
                    whiteSpace: "nowrap",
                  }}
                >
                  Groupe
                </th>
              </tr>
              <tr>
                <th style={{ padding: TABLE_CELL_PADDING }} />
                <th style={{ padding: TABLE_CELL_PADDING }} />
                <th style={{ padding: TABLE_CELL_PADDING }} />
                <th style={{ padding: TABLE_CELL_PADDING }} />
                {CULTURE_FIELDS.map((field) => {
                  const isRpgFillable = field.rpgOffset >= 2;
                  return (
                    <th
                      key={`${field.field}-fill`}
                      style={{
                        padding: TABLE_CELL_PADDING,
                        textAlign: "left",
                      }}
                    >
                      {isRpgFillable ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFillRpgColumn(field);
                          }}
                          disabled={rpgLoadingField != null}
                          style={{
                            padding: "3px 8px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            background: "#fff",
                            fontSize: 11,
                            cursor: rpgLoadingField ? "not-allowed" : "pointer",
                            opacity: rpgLoadingField ? 0.6 : 1,
                          }}
                        >
                          {rpgLoadingField === field.field
                            ? "Chargement..."
                            : "Remplir (RPG)"}
                        </button>
                      ) : null}
                    </th>
                  );
                })}
                <th style={{ padding: TABLE_CELL_PADDING }} />
                <th style={{ padding: TABLE_CELL_PADDING }} />
                <th style={{ padding: TABLE_CELL_PADDING }} />
              </tr>
            </thead>
            <tbody>
              {features.map((f, idx) => {
                const id = f.id || idx;
                const typedRow = typed[id] || {};
                const ilot = (f.properties?.ilot_numero ?? "").toString().trim();
                const num = (f.properties?.numero ?? "").toString().trim();
                const parcelleValue = buildParcelleValue(ilot, num);
                const parcelleName = (f.properties?.nom ?? "").toString();
                const typeSolValue = resolveTypeSol(f.properties || "");
                const parcelleBioRaw =
                  f.properties?.parcelle_bio ??
                  f.properties?.bio ??
                  f.properties?.parcelleBio ??
                  f.properties?.parcelle_bio_label;
                const parcelleBioChecked = parseParcelleBioValue(parcelleBioRaw);
                const area = featureAreaM2(f);
                const surfaceHa = area != null ? area / 10000 : null;
                const yearValue =
                  f.properties?.annee ??
                  f.properties?.import_year ??
                  "";
                const selected = selectedId === id;
                const fillColor = normalizeHexColor(
                  f.properties?.color,
                  DEFAULT_POLYGON_FILL
                );
                const outlineColor = normalizeHexColor(
                  f.properties?.outlineColor ?? f.properties?.color,
                  DEFAULT_POLYGON_LINE
                );

                return (
                  <tr
                    key={id}
                    ref={(el) => {
                      if (el) rowsRef.current.set(id, el);
                      else rowsRef.current.delete(id);
                    }}
                    onClick={() => onSelect?.(id)}
                    style={{
                      background: selected ? "#e0ecff" : idx % 2 === 0 ? "#fff" : "#f9fafb",
                      cursor: "pointer",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    <td
                      style={{
                        padding: TABLE_CELL_PADDING,
                        minWidth: 80,
                        width: 90,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <input
                        value={parcelleValue}
                        onChange={(e) => {
                          updateParcelleParts(idx, e.target.value);
                        }}
                        onBlur={(e) => updateParcelleParts(idx, e.target.value, { enforceNumero: true })}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Îlot.Numéro"
                        style={{
                          width: "100%",
                          padding: "2px 4px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                          fontWeight: 600,
                          textAlign: "center",
                        }}
                      />
                    </td>
                    <td
                      style={{
                        padding: TABLE_CELL_PADDING,
                        minWidth: 140,
                        width: 200,
                        whiteSpace: "normal",
                        verticalAlign: "top",
                      }}
                    >
                      <input
                        value={parcelleName}
                        onChange={(e) => updateNomValue(idx, e.target.value)}
                        onBlur={(e) => updateNomValue(idx, e.target.value, { trim: true })}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Nom personnalisé"
                        style={{
                          width: "100%",
                          padding: "3px 6px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                        }}
                      />
                    </td>
                    <td
                      style={{
                        padding: TABLE_CELL_PADDING,
                        textAlign: "right",
                        fontSize: 12,
                        color: "#374151",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {surfaceHa != null && !Number.isNaN(surfaceHa)
                        ? surfaceHa.toFixed(2)
                        : "–"}
                    </td>
                    <td
                      style={{
                        padding: TABLE_CELL_PADDING,
                        textAlign: "center",
                        width: 80,
                      }}
                    >
                      <input
                        type="number"
                        value={yearValue}
                        onChange={(e) =>
                          updateFeatureProperty(idx, "annee", e.target.value, {
                            trim: true,
                          })
                        }
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Année"
                        style={{
                          width: "100%",
                          padding: "2px 4px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                          textAlign: "center",
                        }}
                      />
                    </td>
                    <td
                      style={{
                        padding: TABLE_CELL_PADDING,
                        textAlign: "center",
                        width: 110,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={parcelleBioChecked}
                        onChange={(e) => updateParcelleBio(idx, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Parcelle bio"
                      />
                    </td>
                    {CULTURE_FIELDS.map((field) => (
                      <td
                        key={field.field}
                        style={{
                          padding: TABLE_CELL_PADDING,
                          minWidth: 140,
                          width: 150,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <input
                            list={datalistId}
                            value={typedRow[field.field] ?? ""}
                            onChange={(e) => handleCultureChange(id, idx, field.field, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Nom ou code…"
                            style={{
                              width: "100%",
                              padding: "3px 6px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          />
                          {renderWarning(typedRow[field.field])}
                        </div>
                      </td>
                    ))}
                    <td
                      style={{
                        padding: TABLE_CELL_PADDING,
                        minWidth: 140,
                        width: 160,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <input
                        value={typeSolValue}
                        onChange={(e) => updateTypeSol(idx, e.target.value)}
                        onBlur={(e) => updateTypeSol(idx, e.target.value, { trim: true })}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Type de sol"
                        style={{
                          width: "100%",
                          padding: "3px 6px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                        }}
                      />
                    </td>
                    <td
                      style={{
                        padding: TABLE_CELL_PADDING,
                        minWidth: 170,
                        width: 170,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="color"
                            value={fillColor}
                            onChange={(e) =>
                              updateFeatureColor(idx, "color", e.target.value)
                            }
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Couleur de remplissage"
                          />
                          <span style={{ fontSize: 11, color: "#374151" }}>Rempl.</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="color"
                            value={outlineColor}
                            onChange={(e) =>
                              updateFeatureColor(idx, "outlineColor", e.target.value)
                            }
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Couleur du contour"
                          />
                          <span style={{ fontSize: 11, color: "#374151" }}>Contour</span>
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          resetFeatureColors(idx);
                        }}
                        style={{
                          marginTop: 4,
                          padding: "2px 6px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          background: "#fff",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Réinitialiser
                      </button>
                    </td>
                    <td
                      style={{
                        padding: TABLE_CELL_PADDING,
                        minWidth: 130,
                        width: 140,
                      }}
                    >
                      <input
                        value={f.properties?.layerType ?? ""}
                        onChange={(e) =>
                          updateFeatureProperty(idx, "layerType", e.target.value)
                        }
                        onBlur={(e) =>
                          updateFeatureProperty(idx, "layerType", e.target.value, { trim: true })
                        }
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Ex: télépac"
                        style={{
                          width: "100%",
                          padding: "2px 4px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <datalist id={datalistId}>
          {options.map(([c, l]) => (
            <option key={c} value={l}>{c}</option>
          ))}
        </datalist>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      {features.map((f, idx) => {
        const id = f.id || idx;
        const typedRow = typed[id] || {};
        const knownLabel = typedRow.cultureN ?? "";
        const displayValue = knownLabel ?? "";
        const displayPrevious = typedRow.cultureN_1 ?? "";
        const listId = datalistId;
        const selected = selectedId === id;
        const groupValue = f.properties?.layerType ?? "";

        const ilot = normalizePart(f.properties?.ilot_numero);
        const num = normalizePart(f.properties?.numero);
        const rawParcelleValue = buildParcelleValue(ilot, num);
        const hasParcelleParts = Boolean(ilot || num);
        const parcelleValue = hasParcelleParts ? rawParcelleValue : "";
        const parcelleNameRaw = f.properties?.nom;
        const parcelleName = parcelleNameRaw == null ? "" : String(parcelleNameRaw);
        const displayTitle = normalizePart(parcelleName)
          || (hasParcelleParts ? rawParcelleValue : "");
        const isEditingParcelle = editingParcelleId === id;

        const area = featureAreaM2(f);
        const surfaceHa = area != null ? area / 10000 : null;
        const fillColor = normalizeHexColor(
          f.properties?.color,
          DEFAULT_POLYGON_FILL
        );
        const outlineColor = normalizeHexColor(
          f.properties?.outlineColor ?? f.properties?.color,
          DEFAULT_POLYGON_LINE
        );

        return (
          <div
            key={id}
            ref={(el) => {
              if (el) rowsRef.current.set(id, el);
              else rowsRef.current.delete(id);
            }}
            onClick={() => onSelect?.(id)}
            style={{
              border: selected ? "2px solid #2563eb" : "1px solid #ddd",
              boxShadow: selected ? "0 0 0 2px rgba(37,99,235,0.15)" : "none",
              borderRadius: 10,
              padding: 10,
              marginTop: 8,
              cursor: "pointer",
              transition: "box-shadow .15s ease, border-color .15s ease",
            }}
            title="Cliquer pour sélectionner la parcelle sur la carte"
            >
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 6,
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                alignItems: "baseline",
              }}
            >
              <span>Parcelle</span>
              {isEditingParcelle ? (
                <input
                  ref={(el) => {
                    if (el) parcelleInputRefs.current.set(id, el);
                    else parcelleInputRefs.current.delete(id);
                  }}
                  value={parcelleValue}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateParcelleParts(idx, e.target.value)}
                  onBlur={(e) => {
                    updateParcelleParts(idx, e.target.value, { enforceNumero: true });
                    setEditingParcelleId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      updateParcelleParts(idx, e.currentTarget.value, { enforceNumero: true });
                      setEditingParcelleId(null);
                    } else if (e.key === "Escape") {
                      e.currentTarget.value = parcelleValue;
                      setEditingParcelleId(null);
                    }
                  }}
                  style={{
                    minWidth: 80,
                    padding: "2px 6px",
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    fontWeight: 600,
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingParcelleId(id);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: "2px 6px",
                    borderRadius: 6,
                    cursor: "text",
                    fontWeight: 600,
                  }}
                >
                  {parcelleValue || id}
                </button>
              )}
              {displayTitle && displayTitle !== parcelleValue && (
                <span style={{ color: "#4b5563", fontWeight: 500 }}>
                  {displayTitle}
                </span>
              )}
            </div>
            {surfaceHa != null && !Number.isNaN(surfaceHa) && (
              <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
                Surface : {surfaceHa.toFixed(2)} ha
              </div>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              <label style={{ fontSize: 12, flex: "1 1 140px" }}>
                Nom (optionnel)
                <input
                  value={parcelleName}
                  onChange={(e) => updateNomValue(idx, e.target.value)}
                  onBlur={(e) => updateNomValue(idx, e.target.value, { trim: true })}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Nom personnalisé"
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                  }}
                />
              </label>
            </div>

            <label style={{ fontSize: 12, display: "block", marginBottom: 10 }}>
              Culture N (Assolia)
              <input
                list={listId}
                value={displayValue}
                onChange={(e) => handleCultureChange(id, idx, "cultureN", e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Tapez le nom (ou le code)…"
                style={{
                  width: "90%",
                  padding: "6px 8px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />
              {renderWarning(displayValue)}
            </label>

            <label style={{ fontSize: 12, display: "block" }}>
              Culture N-1
              <input
                list={listId}
                value={displayPrevious}
                onChange={(e) => handleCultureChange(id, idx, "cultureN_1", e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Tapez le nom (ou le code)…"
                style={{
                  width: "90%",
                  padding: "6px 8px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />
              {renderWarning(displayPrevious)}
            </label>

            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: "1px dashed #e5e7eb",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Couleurs de la parcelle
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  Remplissage
                  <input
                    type="color"
                    value={fillColor}
                    onChange={(e) => updateFeatureColor(idx, "color", e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  Contour
                  <input
                    type="color"
                    value={outlineColor}
                    onChange={(e) =>
                      updateFeatureColor(idx, "outlineColor", e.target.value)
                    }
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetFeatureColors(idx);
                  }}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Réinitialiser
                </button>
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                Les couleurs sont appliquées immédiatement sur la carte.
              </div>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#555" }}>Groupe (filtre)</span>
              <input
                value={groupValue}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  updateFeatureProperty(idx, "layerType", e.target.value)
                }
                onBlur={(e) =>
                  updateFeatureProperty(idx, "layerType", e.target.value, { trim: true })
                }
                placeholder="Ex: télépac, manuel"
                style={{
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 12,
                }}
              />
            </label>
          </div>
        );
      })}
      <datalist id={datalistId}>
        {options.map(([c, l]) => (
          <option key={c} value={l}>{c}</option>
        ))}
      </datalist>
    </div>
  );
}
