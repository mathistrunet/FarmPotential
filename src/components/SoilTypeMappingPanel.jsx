import React, { useMemo, useState } from "react";

export default function SoilTypeMappingPanel({
  soilCombinations,
  mappingsByStructure,
  onSaveStructureMappings,
  loading = false,
  saving = false,
}) {
  const structureNames = useMemo(
    () => Object.keys(mappingsByStructure || {}).sort((a, b) => a.localeCompare(b)),
    [mappingsByStructure]
  );
  const [selectedStructure, setSelectedStructure] = useState("");
  const [newStructureName, setNewStructureName] = useState("");
  const [search, setSearch] = useState("");
  const [localMappings, setLocalMappings] = useState({});

  const structure = (selectedStructure || newStructureName).trim();

  React.useEffect(() => {
    if (!structure) {
      setLocalMappings({});
      return;
    }
    setLocalMappings({ ...(mappingsByStructure?.[structure] || {}) });
  }, [structure, mappingsByStructure]);

  const filteredCombinations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return soilCombinations;
    return soilCombinations.filter((entry) => entry.combination_label.toLowerCase().includes(q));
  }, [soilCombinations, search]);

  const handleSave = async () => {
    if (!structure) {
      alert("Renseigne une structure pour enregistrer le mapping.");
      return;
    }
    await onSaveStructureMappings(structure, localMappings);
    if (!selectedStructure) setSelectedStructure(structure);
    setNewStructureName("");
  };

  return (
    <div style={{ paddingTop: 10 }}>
      <p style={{ marginTop: 0, color: "#555", fontSize: 13 }}>
        Associe chaque combinaison RRP à un type de sol métier Assolia pour une structure.
      </p>
      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer les combinaisons..."
          style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6 }}
        />
      </div>

      <div style={{ maxHeight: 420, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
        {loading ? (
          <div style={{ padding: 12 }}>Chargement des types de sol RRP...</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Combinaison RRP</th>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb", width: "45%" }}>Type de sol Assolia</th>
              </tr>
            </thead>
            <tbody>
              {filteredCombinations.map((entry) => (
                <tr key={entry.source_file}>
                  <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{entry.combination_label}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                    <input
                      value={localMappings[entry.combination_label] || ""}
                      onChange={(e) =>
                        setLocalMappings((prev) => ({
                          ...prev,
                          [entry.combination_label]: e.target.value,
                        }))
                      }
                      style={{ width: "100%", padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                      placeholder="Ex: Sol limono-argileux profond"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || loading}
        style={{ marginTop: 10, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer" }}
      >
        {saving ? "Enregistrement..." : "Enregistrer le mapping"}
      </button>
    </div>
  );
}
