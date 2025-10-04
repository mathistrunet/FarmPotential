import { useCallback } from "react";
import { RASTER_LAYERS } from "../../config/rasterLayers";

export function useRasterLayers() {
  return useCallback((map) => {
    RASTER_LAYERS.forEach((def) => {
      const srcId = def.sourceId || `${def.id}_src`;
      const lyrId = def.mapLayerId || `${def.id}_lyr`;

      if (def.managedExternally) return;

      if (!map.getSource(srcId)) {
        const sourceConfig = {
          type: "raster",
          tiles: def.subdomains
            ? def.subdomains.map((s) => def.url.replace("{s}", s))
            : [def.url],
          tileSize: def.tileSize || 256,
          attribution: def.attribution || "",
        };

        if (def.scheme) {
          sourceConfig.scheme = def.scheme;
        }
        if (def.bounds) {
          sourceConfig.bounds = def.bounds;
        }
        if (typeof def.minZoom === "number") {
          sourceConfig.minzoom = def.minZoom;
        }
        if (typeof def.maxZoom === "number") {
          sourceConfig.maxzoom = def.maxZoom;
        }

        map.addSource(srcId, sourceConfig);
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
