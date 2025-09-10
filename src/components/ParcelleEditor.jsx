// src/components/ParcelleEditor.jsx
import React, { useEffect, useRef, useState } from "react";
import { entriesCodebook, labelFromCode, codeFromLabel } from "../utils/cultureLabels";
import { ringAreaM2 } from "../utils/geometry";

export default function ParcelleEditor({ features, setFeatures, selectedId, onSelect }) {
  const options = entriesCodebook();                 // [[code,label], ...]
  const rowsRef = useRef(new Map());
  const [typed, setTyped] = useState({});            // saisie libre par parcelle (id -> string)

  // Quand la sélection change depuis la CARTE, on fait défiler la fiche correspondante
  useEffect(() => {
    if (!selectedId) return;
    const el = rowsRef.current.get(selectedId);
    if (el?.scrollIntoView) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("row-selected");
      setTimeout(() => el.classList.remove("row-selected"), 700);
    }
  }, [selectedId]);

  // Quand la liste des features change (import, suppression...), initialiser typed au besoin
  useEffect(() => {
    setTyped((prev) => {
      const next = { ...prev };
      features.forEach((f, idx) => {
        const id = f.id || idx;
        if (next[id] == null) {
          const code = (f.properties?.code || "").trim().toUpperCase();
          const label = labelFromCode(code);
          next[id] = label || code || "";
        }
      });
      return next;
    });
  }, [features]);

  return (
    <div style={{ marginTop: 12 }}>
      {features.map((f, idx) => {
        const id = f.id || idx;
        const code = (f.properties?.code || "").trim().toUpperCase();
        const knownLabel = labelFromCode(code);        // libellé via codebook
        const listId = `cultures-list-${id}`;
        const selected = selectedId === id;

        // Valeur affichée = ce que l'utilisateur tape pour CETTE parcelle
        const displayValue = typed[id] ?? (knownLabel || code || "");

        // Affichage "ilot.numero" si les deux sont présents ; sinon on retombe sur ce qu’on a (numéro seul, ou îlot seul), ou à défaut l'id.
        const ilot = (f.properties?.ilot_numero ?? "").toString().trim();
        const num  = (f.properties?.numero ?? "").toString().trim();
        const titre = ilot && num ? `${ilot}.${num}` : (ilot || num || "");

        const surfaceHa =
          f.properties?.surfaceHa != null
            ? f.properties.surfaceHa
            : f.geometry?.coordinates?.[0]
              ? ringAreaM2(f.geometry.coordinates[0]) / 10000
              : null;


        return (
          <div
            key={id}
            ref={(el) => rowsRef.current.set(id, el)}
            onClick={() => onSelect?.(id)}
            style={{
              border: selected ? "2px solid #2563eb" : "1px solid #ddd",
              boxShadow: selected ? "0 0 0 2px rgba(37,99,235,0.15)" : "none",
              borderRadius: 10, padding: 10, marginTop: 8, cursor: "pointer",
              transition: "box-shadow .15s ease, border-color .15s ease",
            }}
            title="Cliquer pour sélectionner la parcelle sur la carte"
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Parcelle {titre}
              {surfaceHa != null && !Number.isNaN(surfaceHa) && (
                <span style={{ marginLeft: 8, fontWeight: 400, color: "#555" }}>
                  ({surfaceHa.toFixed(2)} ha)
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
              Surface : {surfaceHa.toFixed(2)} ha
            </div>
            {surfaceHa != null && !Number.isNaN(surfaceHa) && (
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                Surface : {surfaceHa.toFixed(2)} ha
              </div>
            )}

            {/* Ligne 1 : Îlot + Numéro parcelle (compacts) */}
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              <label style={{ fontSize: 12, flex: "0 0 70px" }}>
                Îlot
                <input
                  value={f.properties?.ilot_numero ?? ""}
                  onChange={(e) => {
                    f.properties = { ...f.properties, ilot_numero: e.target.value };
                    setFeatures([...features]);
                  }}
                  onClick={(e)=>e.stopPropagation()}
                  placeholder="Ex. 9"
                  style={{ width: "100%", padding: "4px 6px", border: "1px solid #ccc", borderRadius: 4 }}
                />
              </label>

              <label style={{ fontSize: 12, flex: "0 0 110px" }}>
                N° parcelle
                <input
                  value={f.properties?.numero ?? ""}
                  onChange={(e) => {
                    f.properties = { ...f.properties, numero: e.target.value };
                    setFeatures([...features]);
                  }}
                  onClick={(e)=>e.stopPropagation()}
                  placeholder="Ex. 1"
                  style={{ width: "100%", padding: "4px 6px", border: "1px solid #ccc", borderRadius: 4 }}
                />
              </label>
            </div>

            {/* Ligne 2 : Culture (plein largeur, avec codebook + saisie libre) */}
            <label style={{ fontSize: 12 }}>
              Culture (Assolia)
              <input
                list={listId}
                value={displayValue}
                onChange={(e) => {
                  const val = e.target.value;
                  // 1) Toujours mettre à jour la saisie affichée (permet d'écrire librement)
                  setTyped((prev) => ({ ...prev, [id]: val }));

                  const trimmed = val.trim();
                  // 2) si l'utilisateur choisit un libellé exact → on stocke le code associé
                  const exactCode = codeFromLabel(trimmed);
                  if (exactCode) {
                    f.properties = { ...f.properties, code: exactCode };
                    setFeatures([...features]);
                    // on replace l'affichage par le libellé officiel
                    setTyped((prev) => ({ ...prev, [id]: labelFromCode(exactCode) || exactCode }));
                    return;
                  }
                  // 3) s'il tape un code plausible → on le stocke en UPPER
                  if (/^[A-Za-z0-9]{2,10}$/.test(trimmed)) {
                    const upper = trimmed.toUpperCase();
                    f.properties = { ...f.properties, code: upper };
                    setFeatures([...features]);
                    // on laisse l'affichage tel quel (upper)
                    setTyped((prev) => ({ ...prev, [id]: upper }));
                    return;
                  }
                  // 4) sinon, on attend qu'il choisisse une option; on ne touche pas aux props
                }}
                onClick={(e)=>e.stopPropagation()}
                placeholder="Tapez le nom (ou le code)…"
                style={{ width: "90%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6 }}
              />
              <datalist id={listId}>
                {options.map(([c, l]) => (
                  <option key={c} value={l}>{c}</option>
                ))}
              </datalist>

              {/* Alerte seulement si un code est stocké mais inconnu du codebook */}
              {(() => {
                // Texte saisi actuellement (ce que l'utilisateur voit)
                const raw = (typed[id] ?? "").trim();

                // 1) Champ vide → pas de message
                if (raw === "") return null;

                // On compte le nombre de caractères saisis, en ignorant les espaces
                const len = raw.replace(/\s+/g, "").length;

                // 2) Moins de 3 caractères → pas de message
                if (len < 3) return null;

                // 3) Exactement 3 caractères → on vérifie un CODE (ex: BTH)
                if (len === 3) {
                  const asCode = raw.toUpperCase();
                  const knownByCode = !!labelFromCode(asCode);
                  if (!knownByCode) {
                    return (
                      <div style={{ fontSize: 12, color: "#a00", marginTop: 4 }}>
                        “{asCode}” n’est pas un <b>code culture</b> reconnu.
                      </div>
                    );
                  }
                  return null; // code connu → pas d'erreur
                }

                // 4) Plus de 3 caractères → on vérifie un NOM (libellé) exact
                const knownByLabel = !!codeFromLabel(raw);
                if (!knownByLabel) {
                  return (
                    <div style={{ fontSize: 12, color: "#a00", marginTop: 4 }}>
                      “{raw}” n’est pas un <b>nom de culture</b> reconnu.
                    </div>
                  );
                }

                return null; // nom reconnu → pas d'erreur
              })()}

              
            </label>
          </div>
        );
      })}
    </div>
  );
}
