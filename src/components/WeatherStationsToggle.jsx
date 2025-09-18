import React, { useEffect, useState } from "react";
import { WEATHER_STATION_LAYER_IDS } from "../features/map/useWeatherStationsLayer";

const LAYER_IDS = Object.values(WEATHER_STATION_LAYER_IDS);

export default function WeatherStationsToggle({ mapRef }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const map = mapRef?.current;
    if (!map) return undefined;

    const applyVisibility = () => {
      LAYER_IDS.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
        }
      });
    };

    if (map.isStyleLoaded && !map.isStyleLoaded()) {
      const onIdle = () => {
        applyVisibility();
        map.off("idle", onIdle);
      };
      map.on("idle", onIdle);
      return () => map.off("idle", onIdle);
    }

    applyVisibility();
    return undefined;
  }, [mapRef, visible]);

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={visible}
          onChange={(event) => setVisible(event.target.checked)}
        />
        <span>Stations météo (points et libellés)</span>
      </label>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "#555" }}>
        Chaque station est représentée sur la carte avec son nom ou sa ville afin de
        repérer la plus proche.
      </p>
    </div>
  );
}
