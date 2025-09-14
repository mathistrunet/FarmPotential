import { useCallback } from "react";
import { RASTER_LAYERS } from "../../config/rasterLayers";

export function useRasterLayers() {
  return useCallback((map) => {
    RASTER_LAYERS.forEach((def) => {
      const srcId = `${def.id}_src`;
      const lyrId = `${def.id}_lyr`;
      if (!map.getSource(srcId)) {
        map.addSource(srcId, {
          type: "raster",
          tiles: def.subdomains ? def.subdomains.map((s) => def.url.replace("{s}", s)) : [def.url],
          tileSize: def.tileSize || 256,
          attribution: def.attribution || "",
        });
      }
      if (!map.getLayer(lyrId)) {
        map.addLayer({
          id: lyrId,
          type: "raster",
          source: srcId,
          paint: { "raster-opacity": def.defaultOpacity ?? 1.0 },
        });
        map.setLayoutProperty(
          lyrId,
          "visibility",
          (def.defaultVisible ?? false) ? "visible" : "none"
        );
      }
    });
  }, []);
}
