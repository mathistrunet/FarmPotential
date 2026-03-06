import React, { useEffect, useMemo, useState } from "react";
import {
  applySequentialSoilMapping,
  buildMappingCsv,
  normalizeSoilTypeConfiguration,
  parseMappingCsv,
  SOIL_RULE_ATTRIBUTES,
} from "../services/soilTypeMapping";

const ATTRIBUTE_LABELS = {
  texture: "Texture",
  profondeur: "Profondeur",
  position_topo: "Position topo",
  hydromorphie: "Hydromorphie",
  ph_classe: "pH classe",
  cailloux: "Cailloux",
};

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
    attributes,
  };
}

function parseList(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatHa(value) {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
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

  const structure = (selectedStructure || newStructureName).trim();

  useEffect(() => {
    if (!structure) {
      setSoilTypes([createSoilType("Autres sols")]);
      return;
    }
    const config = normalizeSoilTypeConfiguration(mappingsByStructure?.[structure]);
    setSoilTypes(config.soilTypes.length ? config.soilTypes : [createSoilType("Autres sols")]);
  }, [structure, mappingsByStructure]);

  const mappingPreview = useMemo(() => {
    const { assignments, remainingIndices } = applySequentialSoilMapping(parcelCandidates, { soilTypes });
    const summaryBySoilType = soilTypes.map((soilType, index) => {
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
    link.download = `${(structure || "mapping_sols").replace(/\s+/g, "_")}.csv`;
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

  const setSoilType = (index, updater) => {
    setSoilTypes((current) =>
      current.map((soilType, soilTypeIndex) =>
        soilTypeIndex === index ? updater(soilType) : soilType
      )
    );
  };

  return (
    <div style={{ paddingTop: 10, display: "grid", gap: 12 }}>
      <p style={{ marginTop: 0, color: "#555", fontSize: 13 }}>
        Étape 1 : crée une typologie de sols ASSOLIA ordonnée. Étape 2 : définis les règles IN / NOT IN / IS NULL / IS NOT NULL appliquées séquentiellement sur les parcelles restantes.
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
          <strong>Étape 1 — Types de sol ASSOLIA (ordre prioritaire)</strong>
          <button type="button" onClick={() => setSoilTypes((curr) => [...curr, createSoilType("")])} style={buttonStyle}>
            + Ajouter un type
          </button>
        </div>

        {soilTypes.map((soilType, index) => {
          const summary = mappingPreview.summaryBySoilType[index] || { parcels: 0, surfaceHa: 0 };
          return (
            <div key={soilType.id} style={{ border: "1px solid #f1f5f9", borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>#{index + 1}</span>
                <input
                  value={soilType.name}
                  onChange={(e) => setSoilType(index, (prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Nom du type de sol"
                  style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6 }}
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
              <div style={{ marginTop: 8, fontSize: 12, color: "#334155" }}>
                Prévision : {summary.parcels} parcelle(s), {formatHa(summary.surfaceHa)} ha.
              </div>

              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Étape 2 — Règles de mapping</summary>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {SOIL_RULE_ATTRIBUTES.map((attributeName) => {
                    const rule = soilType.attributes?.[attributeName] || emptyRuleForAttribute();
                    return (
                      <div key={attributeName} style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>{ATTRIBUTE_LABELS[attributeName]}</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          <label style={{ fontSize: 12 }}>
                            IN (séparés par virgules)
                            <input
                              value={(rule.include || []).join(", ")}
                              onChange={(e) => {
                                const include = parseList(e.target.value);
                                setSoilType(index, (prev) => ({
                                  ...prev,
                                  attributes: {
                                    ...prev.attributes,
                                    [attributeName]: { ...rule, include },
                                  },
                                }));
                              }}
                              list={`soil-options-${attributeName}`}
                              style={{ width: "100%", marginTop: 4, padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                            />
                          </label>
                          <label style={{ fontSize: 12 }}>
                            NOT IN (séparés par virgules)
                            <input
                              value={(rule.exclude || []).join(", ")}
                              onChange={(e) => {
                                const exclude = parseList(e.target.value);
                                setSoilType(index, (prev) => ({
                                  ...prev,
                                  attributes: {
                                    ...prev.attributes,
                                    [attributeName]: { ...rule, exclude },
                                  },
                                }));
                              }}
                              style={{ width: "100%", marginTop: 4, padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
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
                          <datalist id={`soil-options-${attributeName}`}>
                            {(attributeOptions?.[attributeName] || []).map((option) => (
                              <option key={option} value={option} />
                            ))}
                          </datalist>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>

              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => setSoilTypes((curr) => curr.filter((_, soilTypeIndex) => soilTypeIndex !== index))}
                  disabled={soilTypes.length <= 1}
                >
                  Supprimer
                </button>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => setSoilTypes((curr) => {
                    if (index === 0) return curr;
                    const next = [...curr];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    return next;
                  })}
                  disabled={index === 0}
                >
                  Monter
                </button>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => setSoilTypes((curr) => {
                    if (index >= curr.length - 1) return curr;
                    const next = [...curr];
                    [next[index + 1], next[index]] = [next[index], next[index + 1]];
                    return next;
                  })}
                  disabled={index >= soilTypes.length - 1}
                >
                  Descendre
                </button>
              </div>
            </div>
          );
        })}

        <div style={{ fontSize: 12, color: "#475569" }}>
          Sols restants après toutes les règles : {mappingPreview.remainingParcels} parcelle(s), {formatHa(mappingPreview.remainingSurfaceHa)} ha.
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
