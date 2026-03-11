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
import { ringAreaM2 } from "../utils/geometry";
import { fetchRpgGeoJSON, getCultureLabel, getMapBoundsCRS84 } from "../services/rpg";
import { RPG_MIN_ZOOM } from "../Front/useRpgLayer";

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


  const registerRowRef = (idKey) => (el) => {
    if (!rowsRef.current) rowsRef.current = new Map();
    if (el) {
      rowsRef.current.set(idKey, el);
    } else {
      rowsRef.current.delete(idKey);
    }
  };

  useEffect(() => {
    if (selectedId == null) return;
    const el = rowsRef.current.get(String(selectedId));
    if (el?.scrollIntoView) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("row-selected");
      setTimeout(() => el.classList.remove("row-selected"), 700);
    }
  }, [selectedId, resolvedViewMode]);

  useEffect(() => {
    setTyped((prev) => {
      const ids = features.map((f, idx) => String(f.id ?? idx));
      const prune = (map) => {
        const out = {};
        ids.forEach((id) => {
          if (map && map[id] != null) out[id] = map[id];
        });
        return out;
      };
      const next = buildEmptyTypedState();
      CULTURE_COLUMNS.forEach((col) => {
        next[col.id] = prune(prev[col.id]);
      });

      features.forEach((f, idx) => {
        const idKey = ids[idx];
        const props = f.properties || {};
        CULTURE_COLUMNS.forEach((col) => {
          if (next[col.id][idKey] == null) {
            next[col.id][idKey] = resolveCultureDisplay(props, col.targetKeys, PRECISION_KEYS[col.id]);
          }
        });
      });
      return next;
    });
  }, [features, resolveCultureDisplay]);

    const parseCultureInput = (rawValue) => {
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
  };

  function updateCultureField(fieldKey, feature, idKey, rawValue, targetKeys, precisionKey) {
    const value = rawValue ?? "";
    const trimmed = value.trim();
    const props = { ...(feature.properties || {}) };
    let display = value;
    let changed = false;

    if (trimmed === "") {
      targetKeys.forEach((key) => {
        if (props[key] !== undefined) delete props[key];
      });
      if (precisionKey && props[precisionKey] !== undefined) delete props[precisionKey];
      display = "";
      changed = true;
    } else {
      const parsed = parseCultureInput(trimmed);
      if (parsed.code) {
        targetKeys.forEach((key) => {
          props[key] = parsed.code;
        });
        if (precisionKey) {
          if (parsed.precision) {
            props[precisionKey] = parsed.precision;
          } else {
            const fallbackPrecision = resolvePrecisionForCode(parsed.code, "");
            if (fallbackPrecision) {
              props[precisionKey] = fallbackPrecision;
            } else if (props[precisionKey] !== undefined) {
              delete props[precisionKey];
            }
          }
        }
        display = parsed.display;
        changed = true;
      } else if (/^[A-Za-z0-9]{2,10}$/.test(trimmed)) {
        const upper = trimmed.toUpperCase();
        targetKeys.forEach((key) => {
          props[key] = upper;
        });
        if (precisionKey && props[precisionKey] !== undefined) delete props[precisionKey];
        display = upper;
        changed = true;
      }
    }

    if (changed) {
      feature.properties = props;
      setFeatures([...features]);
    }

    setTyped((prev) => ({
      ...prev,
      [fieldKey]: { ...(prev[fieldKey] || {}), [idKey]: display },
    }));
  }

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



  
  const renderCultureWarning = (raw, precision) => {
    if (!raw) return null;
    if (displayLookup.has(String(raw).trim().toLowerCase())) return null;
    const warn = computeCultureWarning(raw, precision);
    if (!warn) return null;
    return (
      <div style={{ fontSize: 12, color: "#a00", marginTop: 4 }}>
        "{warn.value}" n'est pas un {warn.type === "code" ? <b>code culture</b> : <b>nom de culture</b>} reconnu.
      </div>
    );
  };
  const renderCardView = () => (
    <>
      {features.map((f, idx) => {
        const rawId = f.id ?? idx;
        const idKey = String(rawId);
        const props = f.properties || {};
        const listId = `cultures-list-${idKey}`;
        const selected = String(selectedId) === idKey;

        const cultureDisplay = typed.current[idKey] ?? "";
        const culturePrevDisplay = typed.prev1[idKey] ?? "";

        const ilot = (props.ilot_numero ?? "").toString().trim();
        const num = (props.numero ?? "").toString().trim();
        const titre = ilot && num ? `${ilot}.${num}` : ilot || num || "";

        const ring = f.geometry?.coordinates?.[0];
        const surfaceHa = ring ? ringAreaM2(ring) / 10000 : null;

        const codeExploit = props.code_exploitation ?? props.CODE_EXPLO ?? "";
        const nomParcelle = props.nom_parcelle ?? props.NOM_PARCEL ?? "";
        const typeSol = props.type_sol ?? props.TYPE_SOL ?? "";

        return (
          <div
            key={idKey}
            ref={registerRowRef(idKey)}
            onClick={() => onSelect?.(rawId)}
            style={{
              border: selected ? "2px solid #2563eb" : "1px solid #ddd",
              boxShadow: selected ? "0 0 0 2px rgba(37,99,235,0.15)" : "none",
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
            {(f.properties?.overlap_warning || f.properties?.import_mismatch) && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                {f.properties?.overlap_warning && (
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
                {f.properties?.import_mismatch && (
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
                  const nextProps = {
                    ...props,
                    nom_parcelle: val,
                    NOM_PARCEL: val,
                  };
                  if (val) {
                    nextProps.nom_affiche = val;
                  }
                  f.properties = nextProps;
                  setFeatures([...features]);
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
              <label style={{ fontSize: 12, flex: "1 1 120px" }}>
                Ilot
                <input
                  value={props.ilot_numero ?? ""}
                  onChange={(e) => {
                    f.properties = { ...props, ilot_numero: e.target.value };
                    setFeatures([...features]);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Ex. 9"
                  style={{ width: "100%", padding: "4px 6px", border: "1px solid #ccc", borderRadius: 4, marginTop: 2 }}
                />
              </label>

              <label style={{ fontSize: 12, flex: "1 1 140px" }}>
                N parcelle
                <input
                  value={props.numero ?? ""}
                  onChange={(e) => {
                    f.properties = { ...props, numero: e.target.value };
                    setFeatures([...features]);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Ex. 1"
                  style={{ width: "100%", padding: "4px 6px", border: "1px solid #ccc", borderRadius: 4, marginTop: 2 }}
                />
              </label>

              <label style={{ fontSize: 12, flex: "1 1 150px" }}>
                Code exploitation
                <input
                  value={codeExploit}
                  onChange={(e) => {
                    const val = e.target.value;
                    f.properties = {
                      ...props,
                      code_exploitation: val,
                      CODE_EXPLO: val,
                    };
                    setFeatures([...features]);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Ex. 1234"
                  style={{ width: "100%", padding: "4px 6px", border: "1px solid #ccc", borderRadius: 4, marginTop: 2 }}
                />
              </label>

              <label style={{ fontSize: 12, flex: "1 1 150px" }}>
                Type de sol
                <input
                  value={typeSol}
                  onChange={(e) => {
                    const val = e.target.value;
                    f.properties = {
                      ...props,
                      type_sol: val,
                      TYPE_SOL: val,
                    };
                    setFeatures([...features]);
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
                list={listId}
                value={cultureDisplay}
                onChange={(e) => {
                  updateCultureField("current", f, idKey, e.target.value, ["cultureN", "cultureN_0", "cultureN0", "culture", "code", "code_culture", "CP_CULTU"], PRECISION_KEYS.current);
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="Tapez le nom (ou le code)..."
                style={{ width: "90%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, marginTop: 2 }}
              />
              {renderCultureWarning(cultureDisplay, props?.[PRECISION_KEYS.current])}
            </label>

            <label style={{ fontSize: 12, display: "block" }}>
              Culture N-1
              <input
                list={`${listId}-prev`}
                value={culturePrevDisplay}
                onChange={(e) => {
                  updateCultureField("prev1", f, idKey, e.target.value, ["cultureN_1", "cultureN1", "culture_prec", "CULT_PREC"], PRECISION_KEYS.prev1);
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="Code ou nom"
                style={{ width: "90%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, marginTop: 2 }}
              />
              {renderCultureWarning(culturePrevDisplay, props?.[PRECISION_KEYS.prev1])}
            </label>

            <datalist id={listId}>
              {cultureOptions.map((opt) => (
                <option key={`${opt.code}-${opt.precision || ""}-${opt.display}`} value={opt.display}>
                  {opt.code}
                </option>
              ))}
            </datalist>
            <datalist id={`${listId}-prev`}>
              {cultureOptions.map((opt) => (
                <option key={`${opt.code}-${opt.precision || ""}-${opt.display}`} value={opt.display}>
                  {opt.code}
                </option>
              ))}
            </datalist>
          </div>
        );
      })}
    </>
  );
    const updateGeneralInfo = (field, value) => {
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
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
          <thead>
            <tr>
              <th style={headerStyle}>Îlot</th>
              <th style={headerStyle}>N° parcelle</th>
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
              <th style={headerStyle}>Type de sol</th>
            </tr>
          </thead>
          <tbody>
            {features.map((f, idx) => {
              const rawId = f.id ?? idx;
              const idKey = String(rawId);
              const props = f.properties || {};
              const selected = String(selectedId) === idKey;
              const listId = `cultures-table-${idKey}`;

              const ring = f.geometry?.coordinates?.[0];
              const surfaceHa = ring ? ringAreaM2(ring) / 10000 : null;
              const isBio = parseBioFlag(
                props.isOrganic ?? props.conduite_bio ?? props.bio ?? props.BIO
              );

              const rowStyle = {
                background: selected ? "#eef2ff" : idx % 2 === 0 ? "#fff" : "#f9fafb",
                cursor: "pointer",
              };

              return (
                <tr
                  key={idKey}
                  ref={registerRowRef(idKey)}
                  onClick={() => onSelect?.(rawId)}
                  style={rowStyle}
                >
                  <td style={{ padding: "6px", borderBottom: "1px solid #e5e7eb" }}>
                    <input
                      value={props.ilot_numero ?? ""}
                      onChange={(e) => {
                        f.properties = { ...props, ilot_numero: e.target.value };
                        setFeatures([...features]);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: "100%", padding: "4px", border: "1px solid #d1d5db", borderRadius: 4 }}
                    />
                  </td>
                  <td style={{ padding: "6px", borderBottom: "1px solid #e5e7eb" }}>
                    <input
                      value={props.numero ?? ""}
                      onChange={(e) => {
                        f.properties = { ...props, numero: e.target.value };
                        setFeatures([...features]);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: "100%", padding: "4px", border: "1px solid #d1d5db", borderRadius: 4 }}
                    />
                  </td>
                  <td style={{ padding: "6px", borderBottom: "1px solid #e5e7eb" }}>
                    <input
                      value={props.nom_parcelle ?? props.NOM_PARCEL ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        f.properties = {
                          ...props,
                          nom_parcelle: val,
                          NOM_PARCEL: val,
                          nom_affiche: val || props.nom_affiche,
                        };
                        setFeatures([...features]);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: "100%", padding: "4px", border: "1px solid #d1d5db", borderRadius: 4 }}
                    />
                  </td>


                  <td style={{ padding: "6px", borderBottom: "1px solid #e5e7eb", fontSize: 13 }}>
                    {surfaceHa != null && !Number.isNaN(surfaceHa) ? surfaceHa.toFixed(2) : "-"}
                  </td>
                  <td style={{ padding: "6px", borderBottom: "1px solid #e5e7eb" }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={isBio}
                        onChange={(e) => {
                          const next = e.target.checked;
                          const updated = { ...props };
                          if (next) {
                            updated.conduite_bio = true;
                            updated.isOrganic = true;
                            if (!updated.organicType) {
                              updated.organicType = "AB";
                            }
                          } else {
                            delete updated.conduite_bio;
                            delete updated.isOrganic;
                            delete updated.organicType;
                          }
                          f.properties = updated;
                          setFeatures([...features]);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span>AB</span>
                    </label>
                  </td>
                  {showAdvancedColumns
                    ? ADVANCED_COLUMNS.map((col) => (
                        <td key={col.id} style={{ padding: "6px", borderBottom: "1px solid #e5e7eb" }}>
                          {col.type === "bool" ? (
                            <input
                              type="checkbox"
                              checked={parseBioFlag(props[col.id])}
                              onChange={(e) => {
                                const updated = { ...props, [col.id]: e.target.checked };
                                f.properties = updated;
                                setFeatures([...features]);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <input
                              value={props[col.id] ?? ""}
                              onChange={(e) => {
                                const updated = { ...props, [col.id]: e.target.value };
                                f.properties = updated;
                                setFeatures([...features]);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: "100%", padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                            />
                          )}
                        </td>
                      ))
                    : null}

                  {CULTURE_COLUMNS.map((col) => {
                    const value = typed[col.id]?.[idKey] ?? "";
                    return (
                      <td key={col.id} style={{ padding: "6px", borderBottom: "1px solid #e5e7eb" }}>
                        <input
                          list={`${listId}-${col.id}`}
                          value={value}
                          onChange={(e) => {
                            updateCultureField(col.id, f, idKey, e.target.value, col.targetKeys, PRECISION_KEYS[col.id]);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: "100%", padding: "4px", border: "1px solid #d1d5db", borderRadius: 4 }}
                        />
                        <datalist id={`${listId}-${col.id}`}>
                          {cultureOptions.map((opt) => (
                <option key={`${opt.code}-${opt.precision || ""}-${opt.display}`} value={opt.display}>
                  {opt.code}
                </option>
              ))}
                        </datalist>
                      </td>
                    );
                  })}
                  <td style={{ padding: "6px", borderBottom: "1px solid #e5e7eb" }}>
                    <input
                      value={props.type_sol ?? props.TYPE_SOL ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        f.properties = {
                          ...props,
                          type_sol: val,
                          TYPE_SOL: val,
                        };
                        setFeatures([...features]);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: "100%", padding: "4px", border: "1px solid #d1d5db", borderRadius: 4 }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginTop: 12 }}>
      {resolvedViewMode === "cards" ? renderCardView() : renderTableView()}
    </div>
  );
}



















































