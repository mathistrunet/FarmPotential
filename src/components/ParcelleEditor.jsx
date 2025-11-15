// src/components/ParcelleEditor.jsx
import React, { useEffect, useRef, useState } from "react";
import { entriesCodebook, labelFromCode, codeFromLabel } from "../utils/cultureLabels";
import { ringAreaM2 } from "../utils/geometry";

function computeCultureWarning(raw) {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  const len = value.replace(/\s+/g, "").length;
  if (len < 3) return null;
  if (len === 3) {
    const asCode = value.toUpperCase();
    const known = !!labelFromCode(asCode);
    if (!known) {
      return { type: "code", value: asCode };
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

export default function ParcelleEditor({ features, setFeatures, selectedId, onSelect }) {
  const options = entriesCodebook();
  const rowsRef = useRef(new Map());
  const [viewMode, setViewMode] = useState("card");
  const [typed, setTyped] = useState({ current: {}, prev: {}, prev2: {} });

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
  }, [selectedId, viewMode]);

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
      const next = {
        current: prune(prev.current),
        prev: prune(prev.prev),
        prev2: prune(prev.prev2),
      };
      features.forEach((f, idx) => {
        const idKey = ids[idx];
        const props = f.properties || {};
        if (next.current[idKey] == null) {
          const code = (props.code ?? props.code_culture ?? "").toString().trim().toUpperCase();
          const label = labelFromCode(code);
          next.current[idKey] = label || code || "";
        }
        if (next.prev[idKey] == null) {
          const prevCode = (props.culture_prec ?? props.CULT_PREC ?? "").toString().trim().toUpperCase();
          const labelPrev = labelFromCode(prevCode);
          next.prev[idKey] = labelPrev || prevCode || "";
        }
        if (next.prev2[idKey] == null) {
          const prev2Code = (props.culture_prec2 ?? props.CULT_PREC2 ?? "").toString().trim().toUpperCase();
          const labelPrev2 = labelFromCode(prev2Code);
          next.prev2[idKey] = labelPrev2 || prev2Code || "";
        }
      });
      return next;
    });
  }, [features]);

  function updateCultureField(fieldKey, feature, idKey, rawValue, targetKeys) {
    const value = rawValue ?? "";
    const trimmed = value.trim();
    const props = { ...(feature.properties || {}) };
    let display = value;
    let changed = false;

    if (trimmed === "") {
      targetKeys.forEach((key) => {
        if (props[key] !== undefined) delete props[key];
      });
      display = "";
      changed = true;
    } else {
      const exactCode = codeFromLabel(trimmed);
      if (exactCode) {
        targetKeys.forEach((key) => {
          props[key] = exactCode;
        });
        display = labelFromCode(exactCode) || exactCode;
        changed = true;
      } else if (/^[A-Za-z0-9]{2,10}$/.test(trimmed)) {
        const upper = trimmed.toUpperCase();
        targetKeys.forEach((key) => {
          props[key] = upper;
        });
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
      [fieldKey]: { ...prev[fieldKey], [idKey]: display },
    }));
  }

  const viewToggleStyle = (mode) => ({
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: viewMode === mode ? "#2563eb" : "#fff",
    color: viewMode === mode ? "#fff" : "#1f2937",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: viewMode === mode ? 600 : 500,
    transition: "background .15s ease, color .15s ease",
  });

  const renderCultureWarning = (raw) => {
    const warn = computeCultureWarning(raw);
    if (!warn) return null;
    return (
      <div style={{ fontSize: 12, color: "#a00", marginTop: 4 }}>
        “{warn.value}” n’est pas un {warn.type === "code" ? <b>code culture</b> : <b>nom de culture</b>} reconnu.
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
        const culturePrevDisplay = typed.prev[idKey] ?? "";

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
            title="Cliquer pour sélectionner la parcelle sur la carte"
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Parcelle {titre || nomParcelle || rawId}
            </div>
            {surfaceHa != null && !Number.isNaN(surfaceHa) && (
              <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
                Surface : {surfaceHa.toFixed(2)} ha
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
                Îlot
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
                N° parcelle
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
                  updateCultureField("current", f, idKey, e.target.value, ["code", "code_culture", "CP_CULTU"]);
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="Tapez le nom (ou le code)…"
                style={{ width: "90%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, marginTop: 2 }}
              />
              {renderCultureWarning(cultureDisplay)}
            </label>

            <label style={{ fontSize: 12, display: "block" }}>
              Culture N-1
              <input
                list={`${listId}-prev`}
                value={culturePrevDisplay}
                onChange={(e) => {
                  updateCultureField("prev", f, idKey, e.target.value, ["culture_prec", "CULT_PREC"]);
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="Code ou nom"
                style={{ width: "90%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, marginTop: 2 }}
              />
              {renderCultureWarning(culturePrevDisplay)}
            </label>

            <datalist id={listId}>
              {options.map(([c, l]) => (
                <option key={c} value={l}>
                  {c}
                </option>
              ))}
            </datalist>
            <datalist id={`${listId}-prev`}>
              {options.map(([c, l]) => (
                <option key={c} value={l}>
                  {c}
                </option>
              ))}
            </datalist>
          </div>
        );
      })}
    </>
  );

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

    return (
      <div style={{ marginTop: 8, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              <th style={headerStyle}>Îlot</th>
              <th style={headerStyle}>N° parcelle</th>
              <th style={headerStyle}>Nom</th>
              <th style={headerStyle}>Code explo.</th>
              <th style={headerStyle}>Surface (ha)</th>
              <th style={headerStyle}>Bio</th>
              <th style={headerStyle}>Culture N</th>
              <th style={headerStyle}>Culture N-1</th>
              <th style={headerStyle}>Culture N-2</th>
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

              const cultureDisplay = typed.current[idKey] ?? "";
              const culturePrevDisplay = typed.prev[idKey] ?? "";
              const culturePrev2Display = typed.prev2[idKey] ?? "";

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
                  <td style={{ padding: "6px", borderBottom: "1px solid #e5e7eb" }}>
                    <input
                      value={props.code_exploitation ?? props.CODE_EXPLO ?? ""}
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
                  <td style={{ padding: "6px", borderBottom: "1px solid #e5e7eb" }}>
                    <input
                      list={listId}
                      value={cultureDisplay}
                      onChange={(e) => {
                        updateCultureField("current", f, idKey, e.target.value, ["code", "code_culture", "CP_CULTU"]);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: "100%", padding: "4px", border: "1px solid #d1d5db", borderRadius: 4 }}
                    />
                    <datalist id={listId}>
                      {options.map(([c, l]) => (
                        <option key={c} value={l}>
                          {c}
                        </option>
                      ))}
                    </datalist>
                  </td>
                  <td style={{ padding: "6px", borderBottom: "1px solid #e5e7eb" }}>
                    <input
                      list={`${listId}-prev`}
                      value={culturePrevDisplay}
                      onChange={(e) => {
                        updateCultureField("prev", f, idKey, e.target.value, ["culture_prec", "CULT_PREC"]);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: "100%", padding: "4px", border: "1px solid #d1d5db", borderRadius: 4 }}
                    />
                    <datalist id={`${listId}-prev`}>
                      {options.map(([c, l]) => (
                        <option key={c} value={l}>
                          {c}
                        </option>
                      ))}
                    </datalist>
                  </td>
                  <td style={{ padding: "6px", borderBottom: "1px solid #e5e7eb" }}>
                    <input
                      list={`${listId}-prev2`}
                      value={culturePrev2Display}
                      onChange={(e) => {
                        updateCultureField("prev2", f, idKey, e.target.value, ["culture_prec2", "CULT_PREC2"]);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: "100%", padding: "4px", border: "1px solid #d1d5db", borderRadius: 4 }}
                    />
                    <datalist id={`${listId}-prev2`}>
                      {options.map(([c, l]) => (
                        <option key={c} value={l}>
                          {c}
                        </option>
                      ))}
                    </datalist>
                  </td>
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
    );
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setViewMode("card")}
          style={viewToggleStyle("card")}
        >
          Vue fiche
        </button>
        <button
          type="button"
          onClick={() => setViewMode("table")}
          style={viewToggleStyle("table")}
        >
          Vue tableau
        </button>
      </div>

      {viewMode === "card" ? renderCardView() : renderTableView()}
    </div>
  );
}
