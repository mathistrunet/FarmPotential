import React from "react";
import { RASTER_LAYERS } from "../config/rasterLayers";

export default function RasterToggles({ mapRef }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {RASTER_LAYERS.map(def => {
        const lyrId = `${def.id}_lyr`;
        return (
          <div key={def.id} style={{ border:"1px solid #eee", borderRadius:8, padding:8 }}>
            <label style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input
                type="checkbox"
                defaultChecked={!!def.defaultVisible}
                onChange={(e) => {
                  const map = mapRef.current; if (!map) return;
                  map.setLayoutProperty(lyrId, "visibility", e.target.checked ? "visible" : "none");
                }}
              />
              <span>{def.label}</span>
            </label>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:6 }}>
              <span style={{ fontSize:12, color:"#666" }}>Opacité</span>
              <input
                type="range" min="0" max="1" step="0.05" defaultValue={def.defaultOpacity ?? 1}
                onInput={(e) => {
                  const map = mapRef.current; if (!map) return;
                  map.setPaintProperty(lyrId, "raster-opacity", parseFloat(e.currentTarget.value));
                }}
                style={{ width:"100%" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
