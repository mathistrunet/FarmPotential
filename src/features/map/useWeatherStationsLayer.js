import { useCallback, useRef } from "react";

const SOURCE_ID = "weather_stations_source";
const POINT_LAYER_ID = "weather_stations_points";
const LABEL_LAYER_ID = "weather_stations_labels";

function buildEmptyCollection() {
  return { type: "FeatureCollection", features: [] };
}

export function useWeatherStationsLayer() {
  const cacheRef = useRef({ data: null, loading: false, error: null });

  const ensureLayerExists = useCallback((map, data) => {
    if (!map) return;

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: data || buildEmptyCollection(),
      });
    } else if (data) {
      const source = map.getSource(SOURCE_ID);
      if (source?.setData) {
        source.setData(data);
      }
    }

    if (!map.getLayer(POINT_LAYER_ID)) {
      map.addLayer({
        id: POINT_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.2, 8, 4, 11, 6],
          "circle-color": "#0ea5e9",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
          "circle-opacity": 0.9,
        },
      });
      map.setLayoutProperty(POINT_LAYER_ID, "visibility", "none");
    }

    if (!map.getLayer(LABEL_LAYER_ID)) {
      map.addLayer({
        id: LABEL_LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        layout: {
          "text-field": [
            "coalesce",
            ["get", "name"],
            ["get", "city"],
            ["get", "id"],
          ],

          "text-font": ["Open Sans Semibold"],

          "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9, 12, 13],
          "text-anchor": "top",
          "text-offset": [0, 1],
        },
        paint: {
          "text-color": "#1f2937",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.2,
        },
      });
      map.setLayoutProperty(LABEL_LAYER_ID, "visibility", "none");
    }
  }, []);

  return useCallback(
    async (map) => {
      if (!map) return;

      if (!cacheRef.current.data && !cacheRef.current.loading && !cacheRef.current.error) {
        cacheRef.current.loading = true;
        try {
          const buildFeatures = (stations) =>
            Array.isArray(stations)
              ? stations
                  .map((station) => {
                    const lon = Number(
                      station?.longitude ?? station?.lon ?? station?.geometry?.coordinates?.[0]
                    );
                    const lat = Number(
                      station?.latitude ?? station?.lat ?? station?.geometry?.coordinates?.[1]
                    );
                    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
                      return null;
                    }
                    const name = station?.name || station?.city || station?.id || "Station";
                    const city = station?.city || null;
                    return {
                      type: "Feature",
                      id: station?.id || name,
                      properties: {
                        id: station?.id || null,
                        name,
                        city,
                      },
                      geometry: {
                        type: "Point",
                        coordinates: [lon, lat],
                      },
                    };
                  })
                  .filter(Boolean)
              : [];

          const loadFeatures = async (url) => {
            try {
              const response = await fetch(url);
              if (!response.ok) {
                return [];
              }
              const contentType = (response.headers.get("content-type") || "").toLowerCase();
              if (!contentType.includes("application/json")) {
                return [];
              }
              const json = await response.json();
              return buildFeatures(json?.stations);
            } catch (error) {
              console.warn(`Erreur lors du chargement des stations depuis ${url} :`, error);
              return [];
            }
          };

          const featuresFromApi = await loadFeatures("/api/weather/stations");
          const featuresFromDataset = await loadFeatures(
            "/data/weather-stations-fr.json",
          );

          let features = featuresFromApi;
          if (featuresFromDataset.length) {
            const byId = new Map();
            featuresFromApi.forEach((feature) => {
              if (feature?.id != null) {
                byId.set(feature.id, feature);
              }
            });
            featuresFromDataset.forEach((feature) => {
              if (feature?.id != null && !byId.has(feature.id)) {
                byId.set(feature.id, feature);
              }
            });
            features = Array.from(byId.values());
          }

          if (!features.length) {
            throw new Error("Aucune station météo n'a pu être chargée.");
          }

          cacheRef.current.error = null;
          cacheRef.current.data = { type: "FeatureCollection", features };
        } catch (error) {
          cacheRef.current.error = error;
          cacheRef.current.data = buildEmptyCollection();
          console.error("Erreur lors du chargement des stations météo :", error);
        } finally {
          cacheRef.current.loading = false;
        }
      }

      ensureLayerExists(map, cacheRef.current.data);
    },
    [ensureLayerExists]
  );
}

export const WEATHER_STATION_LAYER_IDS = {
  point: POINT_LAYER_ID,
  label: LABEL_LAYER_ID,
};
