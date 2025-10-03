import React, { useCallback } from "react";
import { RASTER_LAYERS } from "../config/rasterLayers";

export default function RasterToggles({ mapRef }) {
  const handleVisibilityChange = useCallback(
    (layerId, visible) => {
      const map = mapRef.current;
      if (!map || !map.getLayer(layerId)) return;
      map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    },
    [mapRef]
  );

  const handleOpacityChange = useCallback(
    (layerId, value) => {
      const map = mapRef.current;
      if (!map || !map.getLayer(layerId)) return;
      map.setPaintProperty(layerId, "raster-opacity", value);
    },
    [mapRef]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {RASTER_LAYERS.map(def => {
        const lyrId = def.mapLayerId || `${def.id}_lyr`;
        return (
          <div key={def.id} style={{ border:"1px solid #eee", borderRadius:8, padding:8 }}>
            <label style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input
                type="checkbox"
                defaultChecked={!!def.defaultVisible}
                onChange={(e) => handleVisibilityChange(lyrId, e.target.checked)}
              />
              <span>{def.label}</span>
            </label>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:6 }}>
              <span style={{ fontSize:12, color:"#666" }}>Opacité</span>
              <input
                type="range" min="0" max="1" step="0.05" defaultValue={def.defaultOpacity ?? 1}
                onInput={(e) => handleOpacityChange(lyrId, parseFloat(e.currentTarget.value))}
                style={{ width:"100%" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
