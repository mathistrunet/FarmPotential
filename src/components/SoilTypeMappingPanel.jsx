import React, { useEffect, useMemo, useState } from "react";
import {
  applySequentialSoilMapping,
  buildDetectedSoilCombinations,
  buildMappingCsv,
  normalizeSoilTypeConfiguration,
  parseMappingCsv,
  SOIL_RULE_ATTRIBUTES,
} from "../services/soilTypeMapping";

const ATTRIBUTE_LABELS = {
  texture: "Texture",
  profondeur: "Profondeur",
  position_topo: "Topo",
  hydromorphie: "Hydromorphie",
  ph_classe: "pH",
  cailloux: "Cailloux",
};

const NULL_MODALITY = "__NULL__";

const buttonStyle = {
  padding: "6px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
};

function emptyRuleForAttribute() {
  return { include: [], exclude: [], nullMode: "ANY" };
}

function createSoilType(name = "") {
  const attributes = {};
  SOIL_RULE_ATTRIBUTES.forEach((attributeName) => {
    attributes[attributeName] = emptyRuleForAttribute();
  });
  return {
    id: `soil-type-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    residual: false,
    color: "#94a3b8",
    description: "",
    combinationKeys: [],
    attributes,
  };
}

function formatHa(value) {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function valueLabel(v) {
  if (v === NULL_MODALITY) return "NULL";
  return v ? v : "NULL";
}

function ModalitiesMultiSelect({
  label,
  values = [],
  options = [],
  onChange,
}) {
  const normalizedOptions = useMemo(
    () => [
      ...new Set([
        ...(options || []).filter((option) => option != null && option !== ""),
        NULL_MODALITY,
      ]),
    ],
    [options]
  );
  const normalizedValues = useMemo(
    () => [...new Set((values || []).filter((value) => value != null && value !== ""))],
    [values]
  );

  const allSelected = normalizedOptions.length > 0 && normalizedValues.length === normalizedOptions.length;

  const toggleOption = (option, checked) => {
    if (checked) {
      onChange([...normalizedValues, option]);
      return;
    }
    onChange(normalizedValues.filter((value) => value !== option));
  };

  const summary = normalizedValues.length
    ? `${normalizedValues.length} sélectionnée(s)`
    : "Aucune modalité";

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
      <details style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: 6, background: "#fff" }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: "#334155" }}>{summary}</summary>
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onChange(normalizedOptions)}
              style={{ ...buttonStyle, fontSize: 11, padding: "2px 6px" }}
              disabled={!normalizedOptions.length || allSelected}
            >
              Tout cocher
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              style={{ ...buttonStyle, fontSize: 11, padding: "2px 6px" }}
              disabled={!normalizedValues.length}
            >
              Tout décocher
            </button>
          </div>

          {!normalizedOptions.length ? (
            <span style={{ fontSize: 12, color: "#64748b" }}>Aucune modalité détectée.</span>
          ) : (
            <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid #f1f5f9", borderRadius: 6, padding: 6 }}>
              {normalizedOptions.map((option) => {
                const checked = normalizedValues.includes(option);
                return (
                  <label key={option} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "2px 0" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggleOption(option, event.target.checked)}
                    />
                    {valueLabel(option)}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

export default function SoilTypeMappingPanel({
  mappingsByStructure,
  onSaveStructureMappings,
  loading = false,
  saving = false,
  parcelCandidates = [],
  attributeOptions = {},
  onApplyMapping,
  applying = false,
}) {
  const structureNames = useMemo(
    () => Object.keys(mappingsByStructure || {}).sort((a, b) => a.localeCompare(b)),
    [mappingsByStructure]
  );
  const [selectedStructure, setSelectedStructure] = useState("");
  const [newStructureName, setNewStructureName] = useState("");
  const [soilTypes, setSoilTypes] = useState([createSoilType("Autres sols")]);
  const [selectedCombinationKeys, setSelectedCombinationKeys] = useState([]);

  const structure = (selectedStructure || newStructureName).trim();

  useEffect(() => {
    if (!structure) {
      setSoilTypes([createSoilType("Autres sols")]);
      return;
    }
    const config = normalizeSoilTypeConfiguration(mappingsByStructure?.[structure]);
    setSoilTypes(config.soilTypes.length ? config.soilTypes : [createSoilType("Autres sols")]);
  }, [structure, mappingsByStructure]);

  const detectedCombinations = useMemo(
    () => buildDetectedSoilCombinations(parcelCandidates),
    [parcelCandidates]
  );

  const combinationToSoilTypeIndex = useMemo(() => {
    const lookup = new Map();
    soilTypes.forEach((soilType, index) => {
      (soilType.combinationKeys || []).forEach((key) => {
        if (!lookup.has(key)) lookup.set(key, index);
      });
    });
    return lookup;
  }, [soilTypes]);

  const mappingPreview = useMemo(() => {
    const { assignments, remainingIndices } = applySequentialSoilMapping(parcelCandidates, { soilTypes });
    const summaryBySoilType = soilTypes.map((_, index) => {
      let parcels = 0;
      let surfaceHa = 0;
      assignments.forEach((assignment, assignmentIndex) => {
        if (!assignment || assignment.order !== index) return;
        parcels += 1;
        surfaceHa += Number(parcelCandidates[assignmentIndex]?.surfaceHa || 0);
      });
      return { parcels, surfaceHa };
    });

    let remainingSurfaceHa = 0;
    remainingIndices.forEach((index) => {
      remainingSurfaceHa += Number(parcelCandidates[index]?.surfaceHa || 0);
    });

    return {
      summaryBySoilType,
      remainingParcels: remainingIndices.size,
      remainingSurfaceHa,
    };
  }, [parcelCandidates, soilTypes]);

  const setSoilType = (index, updater) => {
    setSoilTypes((current) =>
      current.map((soilType, soilTypeIndex) =>
        soilTypeIndex === index ? updater(soilType) : soilType
      )
    );
  };

  const assignSelectedCombinations = (targetIndex) => {
    if (!selectedCombinationKeys.length) return;
    setSoilTypes((current) =>
      current.map((soilType, index) => {
        const nextKeys = (soilType.combinationKeys || []).filter(
          (key) => !selectedCombinationKeys.includes(key)
        );
        if (index === targetIndex) return { ...soilType, combinationKeys: [...nextKeys, ...selectedCombinationKeys] };
        return { ...soilType, combinationKeys: nextKeys };
      })
    );
    setSelectedCombinationKeys([]);
  };

  const assignUnmappedToResidual = () => {
    const residualIndex = soilTypes.findIndex((soilType) => soilType.residual);
    if (residualIndex < 0) {
      alert("Ajoute un type résiduel avant d'assigner les sols non mappés.");
      return;
    }
    const unmapped = detectedCombinations
      .filter((combination) => !combinationToSoilTypeIndex.has(combination.key))
      .map((combination) => combination.key);
    if (!unmapped.length) return;
    setSelectedCombinationKeys(unmapped);
    setTimeout(() => assignSelectedCombinations(residualIndex), 0);
  };

  const handleSave = async () => {
    if (!structure) {
      alert("Renseigne une structure pour enregistrer le mapping.");
      return;
    }
    const configuration = normalizeSoilTypeConfiguration({ soilTypes });
    await onSaveStructureMappings(structure, configuration);
    if (!selectedStructure) setSelectedStructure(structure);
    setNewStructureName("");
  };

  const handleExportCsv = () => {
    const configuration = normalizeSoilTypeConfiguration({ soilTypes });
    const csv = buildMappingCsv(configuration);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(structure || "soil_mapping").replace(/\s+/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseMappingCsv(text);
    setSoilTypes(parsed.soilTypes.length ? parsed.soilTypes : [createSoilType("Autres sols")]);
    event.target.value = "";
  };

  return (
    <div style={{ paddingTop: 10, display: "grid", gap: 12 }}>
      <p style={{ marginTop: 0, color: "#555", fontSize: 13 }}>
        Étape 1 : crée les types ASSOLIA (nom, couleur, priorité). Étape 2 : FarmPotential détecte les combinaisons réelles de sols. Étape 3 : sélectionne les lignes et assigne-les à un type.
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        <select
          value={selectedStructure}
          onChange={(e) => {
            setSelectedStructure(e.target.value);
            setNewStructureName("");
          }}
          style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6 }}
        >
          <option value="">-- Choisir une structure existante --</option>
          {structureNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <input
          value={newStructureName}
          onChange={(e) => {
            setNewStructureName(e.target.value);
            setSelectedStructure("");
          }}
          placeholder="Ou créer une structure"
          style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6 }}
        />
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <strong>Étape 1 — Types de sol ASSOLIA</strong>
          <button type="button" onClick={() => setSoilTypes((curr) => [...curr, createSoilType("")])} style={buttonStyle}>
            + Ajouter un type
          </button>
        </div>

        {soilTypes.map((soilType, index) => {
          const summary = mappingPreview.summaryBySoilType[index] || { parcels: 0, surfaceHa: 0 };
          return (
            <div key={soilType.id} style={{ border: "1px solid #f1f5f9", borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>#{index + 1}</span>
                <input
                  value={soilType.name}
                  onChange={(e) => setSoilType(index, (prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Nom du type de sol"
                  style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6 }}
                />
                <input
                  type="color"
                  value={soilType.color || "#94a3b8"}
                  onChange={(e) => setSoilType(index, (prev) => ({ ...prev, color: e.target.value }))}
                  title="Couleur"
                />
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={soilType.residual}
                    onChange={(e) => setSoilType(index, (prev) => ({ ...prev, residual: e.target.checked }))}
                  />
                  Résiduel
                </label>
              </div>

              <textarea
                value={soilType.description || ""}
                onChange={(e) => setSoilType(index, (prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Description (optionnel)"
                style={{ width: "100%", marginTop: 8, border: "1px solid #d1d5db", borderRadius: 6, minHeight: 42, padding: 6 }}
              />

              <div style={{ marginTop: 8, fontSize: 12, color: "#334155" }}>
                Prévision : {summary.parcels} parcelle(s), {formatHa(summary.surfaceHa)} ha.
                <button type="button" onClick={() => assignSelectedCombinations(index)} style={{ ...buttonStyle, marginLeft: 8 }}>
                  Assigner la sélection à ce type
                </button>
              </div>

              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Règles avancées (optionnel)</summary>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {SOIL_RULE_ATTRIBUTES.map((attributeName) => {
                    const rule = soilType.attributes?.[attributeName] || emptyRuleForAttribute();
                    return (
                      <div key={attributeName} style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>{ATTRIBUTE_LABELS[attributeName]}</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          <label style={{ fontSize: 12 }}>
                            <ModalitiesMultiSelect
                              label="IN"
                              values={rule.include || []}
                              options={attributeOptions?.[attributeName] || []}
                              onChange={(include) => {
                                setSoilType(index, (prev) => ({
                                  ...prev,
                                  attributes: {
                                    ...prev.attributes,
                                    [attributeName]: { ...rule, include },
                                  },
                                }));
                              }}
                            />
                          </label>
                          <label style={{ fontSize: 12 }}>
                            <ModalitiesMultiSelect
                              label="NOT IN"
                              values={rule.exclude || []}
                              options={attributeOptions?.[attributeName] || []}
                              onChange={(exclude) => {
                                setSoilType(index, (prev) => ({
                                  ...prev,
                                  attributes: {
                                    ...prev.attributes,
                                    [attributeName]: { ...rule, exclude },
                                  },
                                }));
                              }}
                            />
                          </label>
                          <label style={{ fontSize: 12 }}>
                            Null
                            <select
                              value={rule.nullMode || "ANY"}
                              onChange={(e) => {
                                const nullMode = e.target.value;
                                setSoilType(index, (prev) => ({
                                  ...prev,
                                  attributes: {
                                    ...prev.attributes,
                                    [attributeName]: { ...rule, nullMode },
                                  },
                                }));
                              }}
                              style={{ width: "100%", marginTop: 4, padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                            >
                              <option value="ANY">Ignorer</option>
                              <option value="IS_NULL">IS NULL</option>
                              <option value="IS_NOT_NULL">IS NOT NULL</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          );
        })}
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
          <strong>Étape 2 & 3 — Sols détectés et association visuelle</strong>
          <div style={{ fontSize: 12, color: "#475569" }}>
            {selectedCombinationKeys.length} ligne(s) sélectionnée(s)
          </div>
        </div>
        <div style={{ maxHeight: 360, overflow: "auto", border: "1px solid #f1f5f9", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: "#f8fafc" }}>
              <tr>
                <th style={{ textAlign: "left", padding: 6 }}></th>
                {SOIL_RULE_ATTRIBUTES.map((attributeName) => (
                  <th key={attributeName} style={{ textAlign: "left", padding: 6 }}>{ATTRIBUTE_LABELS[attributeName]}</th>
                ))}
                <th style={{ textAlign: "left", padding: 6 }}>Parcelles</th>
                <th style={{ textAlign: "left", padding: 6 }}>Surface</th>
                <th style={{ textAlign: "left", padding: 6 }}>Type ASSOLIA</th>
              </tr>
            </thead>
            <tbody>
              {detectedCombinations.map((combination) => {
                const assignedIndex = combinationToSoilTypeIndex.get(combination.key);
                const assignedType = assignedIndex != null ? soilTypes[assignedIndex] : null;
                const checked = selectedCombinationKeys.includes(combination.key);
                return (
                  <tr key={combination.key} style={{ borderTop: "1px solid #f1f5f9", background: checked ? "#ecfeff" : "#fff" }}>
                    <td style={{ padding: 6 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setSelectedCombinationKeys((curr) =>
                            isChecked ? [...curr, combination.key] : curr.filter((key) => key !== combination.key)
                          );
                        }}
                      />
                    </td>
                    {SOIL_RULE_ATTRIBUTES.map((attributeName) => (
                      <td key={attributeName} style={{ padding: 6 }}>{valueLabel(combination.row[attributeName])}</td>
                    ))}
                    <td style={{ padding: 6 }}>{combination.parcels}</td>
                    <td style={{ padding: 6 }}>{formatHa(combination.surfaceHa)} ha</td>
                    <td style={{ padding: 6 }}>
                      {assignedType ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 999, background: assignedType.color || "#94a3b8" }} />
                          {assignedType.name}
                        </span>
                      ) : "Non mappé"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8 }}>
          <button type="button" style={buttonStyle} onClick={assignUnmappedToResidual}>
            Assigner automatiquement les sols non mappés au type résiduel
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginTop: 8 }}>
          Sols restants après application : {mappingPreview.remainingParcels} parcelle(s), {formatHa(mappingPreview.remainingSurfaceHa)} ha.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={handleSave} disabled={saving || loading} style={buttonStyle}>
          {saving ? "Enregistrement..." : "Enregistrer la configuration"}
        </button>
        <button type="button" onClick={handleExportCsv} disabled={loading} style={buttonStyle}>
          Export CSV
        </button>
        <label style={{ ...buttonStyle, display: "inline-flex", alignItems: "center" }}>
          Import CSV
          <input type="file" accept=".csv,text/csv" onChange={handleImportCsv} style={{ display: "none" }} />
        </label>
        <button
          type="button"
          onClick={() => onApplyMapping?.(normalizeSoilTypeConfiguration({ soilTypes }), structure)}
          disabled={loading || applying}
          style={{ ...buttonStyle, background: "#ecfeff" }}
        >
          {applying ? "Application..." : "Appliquer sur les parcelles"}
        </button>
      </div>
    </div>
  );
}
