import React from "react";
import { SOILS_LAYERS } from "../config/soilsConfig";

interface Props {
  visible: boolean;
  toggle: () => void;
  layerId: string;
  setLayerId: (id: string) => void;
}

export default function SoilsControl({ visible, toggle, layerId, setLayerId }: Props) {
  return (
    <div style={{ borderTop: "1px solid #eee", marginTop: 8, paddingTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontWeight: 600 }}>Carte des sols</label>
        <input
          type="checkbox"
          checked={visible}
          onChange={toggle}
          title="Afficher/Masquer la carte des sols"
        />
      </div>

      <div style={{ marginTop: 6 }}>
        <select
          value={layerId}
          onChange={(e) => setLayerId(e.target.value)}
          style={{ padding: "6px", border: "1px solid #ccc", borderRadius: 6, width: "100%" }}
        >
          {SOILS_LAYERS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

