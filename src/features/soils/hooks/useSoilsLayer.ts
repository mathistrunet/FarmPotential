import { useCallback, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import { SOILS_LAYERS } from "../config/soilsConfig";
import { getInfoAtPoint } from "../services/soilsAdapter";

export function useSoilsLayer(mapRef: any) {
  const [visible, setVisible] = useState(false);
  const [layerId, setLayerId] = useState<string>(SOILS_LAYERS[0]?.id);
  const toggle = useCallback(() => setVisible((v) => !v), []);

  useEffect(() => {
    const map = mapRef.current as maplibregl.Map | undefined;
    if (!map) return;
    const cfg = SOILS_LAYERS.find((l) => l.id === layerId);
    if (!cfg) return;
    const srcId = "soils_src";
    const lyrId = "soils_lyr";

    const clickHandler = (e: maplibregl.MapMouseEvent) => {
      getInfoAtPoint(map, e.lngLat, cfg)
        .then((info) => {
          const html = info
            ? `<strong>${info.title}</strong><br/>` +
              Object.entries(info.attributes)
                .map(([k, v]) => `${k}: ${v}`)
                .join("<br/>")
            : "<em>Aucune donnée</em>";
          new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
        })
        .catch((err) => {
          console.error(err);
          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML("<em>Erreur lors de la récupération des données</em>")
            .addTo(map);
        });
    };

    if (visible) {
      if (map.getLayer(lyrId)) map.removeLayer(lyrId);
      if (map.getSource(srcId)) map.removeSource(srcId);

      if (cfg.mode === "wms") {
        const version = cfg.wms!.version || "1.3.0";
        const crsParam = version === "1.3.0" ? "CRS" : "SRS";
        map.addSource(srcId, {
          type: "raster",
          tiles: [
            `${cfg.wms!.url}?SERVICE=WMS&VERSION=${version}&REQUEST=GetMap&LAYERS=${encodeURIComponent(
              cfg.wms!.layer
            )}&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&${crsParam}=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`,
          ],
          tileSize: 256,
          attribution: `<a href="${cfg.attribution.url}" target="_blank">${cfg.attribution.text}</a>`,
        });
        map.addLayer({
          id: lyrId,
          type: "raster",
          source: srcId,
          paint: { "raster-opacity": cfg.rasterOpacity },
        });
        map.on("click", clickHandler);
      } else {
        map.addSource(srcId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: lyrId,
          type: "fill",
          source: srcId,
          paint: { "fill-color": "#964B00", "fill-opacity": 0.2, "fill-outline-color": "#5e3a00" },
        });
        map.on("click", lyrId, clickHandler);

        const b = map.getBounds();
        const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
        fetch(
          `${cfg.wfs!.url}?service=WFS&version=2.0.0&request=GetFeature&typeName=${cfg.wfs!.typeName}&outputFormat=application/json&srsName=EPSG:4326&bbox=${bbox}`
        )
          .then((r) => r.json())
          .then((geojson) => {
            (map.getSource(srcId) as maplibregl.GeoJSONSource).setData(geojson);
          })
          .catch(() => {});
      }
    } else {
      if (map.getLayer(lyrId)) {
        map.setLayoutProperty(lyrId, "visibility", "none");
      }
      map.off("click", clickHandler);
      map.off("click", lyrId, clickHandler as any);
    }

    return () => {
      map.off("click", clickHandler);
      map.off("click", lyrId, clickHandler as any);
    };
  }, [mapRef, visible, layerId]);

  return { visible, toggle, layerId, setLayerId };
}
