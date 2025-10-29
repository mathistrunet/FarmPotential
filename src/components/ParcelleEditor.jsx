// src/components/ParcelleEditor.jsx
import React, { useEffect, useRef, useState } from "react";
import {
  entriesCodebook,
  labelFromCode,
  codeFromLabel,
} from "../utils/cultureLabels";
import { ringAreaM2 } from "../utils/geometry";

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

export default function ParcelleEditor({
  features,
  setFeatures,
  selectedId,
  onSelect,
  viewMode = "cards",
}) {
  const options = entriesCodebook();
  const rowsRef = useRef(new Map());
  const [typed, setTyped] = useState({});

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
    setTyped((prev) => {
      const next = {};
      features.forEach((f, idx) => {
        const id = f.id || idx;
        const prevRow = prev[id] || {};
        const props = f.properties || {};
        next[id] = {
          cultureN:
            prevRow.cultureN !== undefined
              ? prevRow.cultureN
              : normalizeDisplayValue(
                  props.cultureN ?? props.code ?? props.CULTURE ?? ""
                ),
          cultureN_1:
            prevRow.cultureN_1 !== undefined
              ? prevRow.cultureN_1
              : normalizeDisplayValue(
                  props.cultureN_1 ??
                    props.cultureN1 ??
                    props.culture_prec ??
                    ""
                ),
        };
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
    const trimmed = rawValue.trim();
    let displayValue = rawValue;

    const nextFeatures = [...features];
    const feature = nextFeatures[index];
    if (feature) {
      const propKey = field === "cultureN" ? "cultureN" : "cultureN_1";
      const nextProps = { ...(feature.properties || {}) };
      let shouldUpdate = false;

      if (!trimmed) {
        displayValue = "";
        if (propKey in nextProps) {
          delete nextProps[propKey];
          shouldUpdate = true;
        }
        if (field === "cultureN" && "code" in nextProps) {
          delete nextProps.code;
          shouldUpdate = true;
        }
      } else {
        const exactCode = codeFromLabel(trimmed);
        if (exactCode) {
          nextProps[propKey] = exactCode;
          if (field === "cultureN") nextProps.code = exactCode;
          displayValue = labelFromCode(exactCode) || exactCode;
          shouldUpdate = true;
        } else if (/^[A-Za-z0-9]{2,10}$/.test(trimmed)) {
          const upper = trimmed.toUpperCase();
          nextProps[propKey] = upper;
          if (field === "cultureN") nextProps.code = upper;
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

  const renderWarning = (value) => {
    const message = getCultureWarning(value);
    if (!message) return null;
    return (
      <div style={{ fontSize: 11, color: "#a00", marginTop: 4 }}>{message}</div>
    );
  };

  if (viewMode === "table") {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 720,
              borderCollapse: "collapse",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <thead style={{ background: "#f3f4f6" }}>
              <tr>
                <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12 }}>
                  Parcelle
                </th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12 }}>
                  Nom
                </th>
                <th style={{ textAlign: "right", padding: "10px 12px", fontSize: 12 }}>
                  Surface (ha)
                </th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12 }}>
                  Culture N
                </th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12 }}>
                  Culture N-1
                </th>
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
                const ring = f.geometry?.coordinates?.[0];
                const surfaceHa = ring ? ringAreaM2(ring) / 10000 : null;
                const selected = selectedId === id;

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
                    }}
                  >
                    <td style={{ padding: "10px 12px", minWidth: 140 }}>
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
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      />
                    </td>
                    <td style={{ padding: "10px 12px", minWidth: 140 }}>
                      <input
                        value={parcelleName}
                        onChange={(e) => updateNomValue(idx, e.target.value)}
                        onBlur={(e) => updateNomValue(idx, e.target.value, { trim: true })}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                        placeholder="Nom personnalisé"
                      />
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#374151" }}>
                      {surfaceHa != null && !Number.isNaN(surfaceHa)
                        ? surfaceHa.toFixed(2)
                        : "–"}
                    </td>
                    <td style={{ padding: "10px 12px", minWidth: 220 }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <input
                          list={datalistId}
                          value={typedRow.cultureN ?? ""}
                          onChange={(e) => handleCultureChange(id, idx, "cultureN", e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Tapez le nom ou le code…"
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            fontSize: 13,
                          }}
                        />
                        {renderWarning(typedRow.cultureN)}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", minWidth: 220 }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <input
                          list={datalistId}
                          value={typedRow.cultureN_1 ?? ""}
                          onChange={(e) => handleCultureChange(id, idx, "cultureN_1", e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Tapez le nom ou le code…"
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            fontSize: 13,
                          }}
                        />
                        {renderWarning(typedRow.cultureN_1)}
                      </div>
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

        const ilot = normalizePart(f.properties?.ilot_numero);
        const num = normalizePart(f.properties?.numero);
        const parcelleValue = buildParcelleValue(ilot, num);
        const parcelleNameRaw = f.properties?.nom;
        const parcelleName = parcelleNameRaw == null ? "" : String(parcelleNameRaw);
        const displayTitle = normalizePart(parcelleName)
          || (ilot || num ? parcelleValue : "");

        const ring = f.geometry?.coordinates?.[0];
        const surfaceHa = ring ? ringAreaM2(ring) / 10000 : null;

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
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Parcelle {displayTitle || id}
            </div>
            {surfaceHa != null && !Number.isNaN(surfaceHa) && (
              <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
                Surface : {surfaceHa.toFixed(2)} ha
              </div>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              <label style={{ fontSize: 12, flex: "1 1 140px" }}>
                Parcelle
                <input
                  value={parcelleValue}
                  onChange={(e) => updateParcelleParts(idx, e.target.value)}
                  onBlur={(e) => updateParcelleParts(idx, e.target.value, { enforceNumero: true })}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Îlot.Numéro"
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                    fontWeight: 600,
                  }}
                />
              </label>

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
