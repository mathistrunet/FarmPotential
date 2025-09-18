// src/App.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";


import RasterToggles from "./components/RasterToggles";
import WeatherStationsToggle from "./components/WeatherStationsToggle";
import ParcelleEditor from "./components/ParcelleEditor";
import { useMapInitialization } from "./features/map/useMapInitialization";

// ✅ composant RPG autonome (chemin conservé)
import RpgFeature from "./Front/useRpgLayer";
// ✅ composant Dessin autonome (chemin conservé)
import DrawToolbar from "./Front/DrawToolbar";
// ✅ Import/Export Télépac (chemin conservé)
import ImportTelepacButton, { ExportTelepacButton } from "./Front/TelepacButton";
import WeatherSummaryPage from "./pages/WeatherSummaryPage";
import WeatherModal from "./components/WeatherModal";
import fetchWeatherSummary from "./services/weather";
import haversineDistanceKm from "./utils/distance";

const buildParcelTitle = (feature, index) => {
  if (!feature) return "Parcelle";
  const ilot = (feature.properties?.ilot_numero ?? "").toString().trim();
  const num = (feature.properties?.numero ?? "").toString().trim();
  const titre = ilot && num ? `${ilot}.${num}` : ilot || num || "";
  if (titre) return `Parcelle ${titre}`;
  if (typeof index === "number" && index >= 0) {
    return `Parcelle ${index + 1}`;
  }
  return "Parcelle";
};

function MapExperience({ onOpenSummary = () => {} }) {
  const {
    mapRef,
    drawRef,
    features,
    setFeatures,
    selectedId,
    selectFeatureOnMap,
  } = useMapInitialization();

  const [sideOpen, setSideOpen] = useState(true); // panneau latéral ouvert/fermé
  const [activeTab, setActiveTab] = useState("parcelles"); // "parcelles" | "calques"
  const [compact, setCompact] = useState(false);
  const [weatherModalOpen, setWeatherModalOpen] = useState(false);
  const [stationsState, setStationsState] = useState({ data: null, loading: false, error: null });
  const [nearestStation, setNearestStation] = useState(null);
  const [yearOptions, setYearOptions] = useState([]);
  const [selectedYears, setSelectedYears] = useState([]);
  const [weatherDatasets, setWeatherDatasets] = useState({});
  const [loadingYears, setLoadingYears] = useState([]);
  const [yearErrors, setYearErrors] = useState({});

  const weatherControllersRef = useRef(new Map());
  const lastStationKeyRef = useRef(null);

  const handleRequestWeather = useCallback(() => {
    setWeatherModalOpen(true);
  }, []);

  const abortAllWeatherRequests = useCallback(() => {
    weatherControllersRef.current.forEach((controller) => {
      if (controller && typeof controller.abort === "function") {
        controller.abort();
      }
    });
    weatherControllersRef.current.clear();
    setLoadingYears([]);
  }, []);

  const fetchStations = useCallback(async () => {
    setStationsState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/data/weather-stations-fr.json");
      if (!response.ok) {
        throw new Error(
          `Impossible de récupérer la liste des stations météo (statut ${response.status}).`
        );
      }
      const json = await response.json();
      const stations = Array.isArray(json?.stations)
        ? json.stations
            .map((station) => {
              const latitude = Number(station?.latitude);
              const longitude = Number(station?.longitude);
              if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                return null;
              }
              return {
                id: station?.id || null,
                name: station?.name || station?.city || null,
                city: station?.city || null,
                latitude,
                longitude,
                elevation:
                  typeof station?.elevation === "number" ? station.elevation : null,
              };
            })
            .filter(Boolean)
        : [];
      setStationsState({ data: stations, loading: false, error: null });
    } catch (error) {
      console.error("Erreur lors du chargement des stations météo :", error);
      setStationsState({
        data: null,
        loading: false,
        error:
          error?.message || "Impossible de récupérer la liste des stations météo.",
      });
    }
  }, []);

  const loadWeatherForYear = useCallback(
    async (year) => {
      if (!nearestStation) return;

      const controller = new AbortController();
      weatherControllersRef.current.set(year, controller);
      setLoadingYears((prev) => (prev.includes(year) ? prev : [...prev, year]));

      try {
        const dataset = await fetchWeatherSummary({
          latitude: nearestStation.latitude,
          longitude: nearestStation.longitude,
          startDate: `${year}-01-01`,
          endDate: `${year}-12-31`,
          signal: controller.signal,
        });

        setWeatherDatasets((prev) => ({ ...prev, [year]: dataset }));
        setYearErrors((prev) => {
          if (!prev[year]) return prev;
          const { [year]: _removed, ...rest } = prev;
          return rest;
        });
      } catch (error) {
        if (error?.name === "AbortError") return;
        console.error("Erreur lors du chargement des données météo :", error);
        setYearErrors((prev) => ({
          ...prev,
          [year]: error?.message || "Impossible de récupérer les données météo.",
        }));
      } finally {
        setLoadingYears((prev) => prev.filter((value) => value !== year));
        weatherControllersRef.current.delete(year);
      }
    },
    [nearestStation]
  );

  const handleToggleYear = useCallback((year) => {
    setSelectedYears((prev) => {
      const isSelected = prev.includes(year);
      if (isSelected) {
        return prev.filter((value) => value !== year);
      }
      setYearErrors((prevErrors) => {
        if (!prevErrors[year]) return prevErrors;
        const { [year]: _removed, ...rest } = prevErrors;
        return rest;
      });
      return [...prev, year].sort((a, b) => b - a);
    });
  }, []);

  const handleRetryYear = useCallback(
    (year) => {
      setYearErrors((prev) => {
        if (!prev[year]) return prev;
        const { [year]: _removed, ...rest } = prev;
        return rest;
      });
      loadWeatherForYear(year);
    },
    [loadWeatherForYear]
  );

  const selectedInfo = useMemo(() => {
    if (selectedId == null) {
      return { feature: null, label: "", centroid: null };
    }

    for (let i = 0; i < features.length; i += 1) {
      const feature = features[i];
      const featureId = feature?.id ?? feature?.properties?.id ?? i;
      if (String(featureId) === String(selectedId)) {
        const ring = feature?.geometry?.coordinates?.[0];
        let centroid = null;
        if (Array.isArray(ring) && ring.length) {
          let sumLon = 0;
          let sumLat = 0;
          let valid = 0;
          ring.forEach((point) => {
            if (Array.isArray(point) && point.length >= 2) {
              const lon = Number(point[0]);
              const lat = Number(point[1]);
              if (!Number.isNaN(lon) && !Number.isNaN(lat)) {
                sumLon += lon;
                sumLat += lat;
                valid += 1;
              }
            }
          });
          if (valid > 0) {
            centroid = {
              longitude: sumLon / valid,
              latitude: sumLat / valid,
            };
          }
        }
        return {
          feature,
          label: buildParcelTitle(feature, i),
          centroid,
        };
      }
    }

    return { feature: null, label: "", centroid: null };
  }, [features, selectedId]);

  useEffect(() => {
    if (!weatherModalOpen) {
      abortAllWeatherRequests();
    }
  }, [weatherModalOpen, abortAllWeatherRequests]);

  useEffect(
    () => () => {
      abortAllWeatherRequests();
    },
    [abortAllWeatherRequests]
  );

  useEffect(() => {
    if (!weatherModalOpen) return;
    if (stationsState.data?.length || stationsState.loading || stationsState.error) {
      return;
    }
    fetchStations();
  }, [weatherModalOpen, stationsState.data, stationsState.loading, stationsState.error, fetchStations]);

  useEffect(() => {
    if (!weatherModalOpen) return;

    const centroid = selectedInfo.centroid;
    if (!centroid || !Number.isFinite(centroid.latitude) || !Number.isFinite(centroid.longitude)) {
      setNearestStation(null);
      return;
    }

    if (!stationsState.data?.length) {
      setNearestStation(null);
      return;
    }

    let bestStation = null;
    let minDistance = Infinity;
    stationsState.data.forEach((station) => {
      const distance = haversineDistanceKm(centroid, station);
      if (distance == null) return;
      if (distance < minDistance) {
        minDistance = distance;
        bestStation = { ...station, distanceKm: distance };
      }
    });

    setNearestStation((current) => {
      if (!bestStation) return null;
      if (
        current &&
        current.latitude === bestStation.latitude &&
        current.longitude === bestStation.longitude &&
        current.id === bestStation.id
      ) {
        return current.distanceKm === bestStation.distanceKm ? current : { ...bestStation };
      }
      return bestStation;
    });
  }, [weatherModalOpen, selectedInfo.centroid, stationsState.data]);

  useEffect(() => {
    if (!weatherModalOpen) return;

    const key = nearestStation
      ? `${nearestStation.id || "station"}|${nearestStation.latitude?.toFixed(4) || ""}|${nearestStation.longitude?.toFixed(4) || ""}`
      : "none";

    if (key !== lastStationKeyRef.current) {
      lastStationKeyRef.current = key;
      abortAllWeatherRequests();
      setWeatherDatasets({});
      setYearErrors({});
      setSelectedYears([]);
      setYearOptions([]);
    }
  }, [weatherModalOpen, nearestStation, abortAllWeatherRequests]);

  useEffect(() => {
    if (!weatherModalOpen || !nearestStation) return;

    const currentYear = new Date().getFullYear();
    const options = Array.from({ length: 6 }, (_, idx) => currentYear - idx);

    setYearOptions((prev) => {
      const same =
        prev.length === options.length && prev.every((value, index) => value === options[index]);
      return same ? prev : options;
    });

    setSelectedYears((prev) => {
      const filtered = prev.filter((value) => options.includes(value));
      if (filtered.length) {
        if (filtered.length === prev.length && filtered.every((value, index) => value === prev[index])) {
          return prev;
        }
        return filtered;
      }
      return [options[0]];
    });
  }, [weatherModalOpen, nearestStation]);

  useEffect(() => {
    if (!weatherModalOpen || !nearestStation) return;
    selectedYears.forEach((year) => {
      if (weatherDatasets[year] || loadingYears.includes(year) || yearErrors[year]) {
        return;
      }
      loadWeatherForYear(year);
    });
  }, [
    weatherModalOpen,
    nearestStation,
    selectedYears,
    weatherDatasets,
    loadingYears,
    yearErrors,
    loadWeatherForYear,
  ]);

  const layoutStyle = {
    height: "100%",
    position: "relative",
    display: "grid",
    gridTemplateColumns: sideOpen ? "1fr 420px" : "1fr 0px",
  };

  const barBase = {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    background: "#fff",
    borderTop: "1px solid #e5e7eb",
    boxShadow: "0 -6px 20px rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: compact ? "6px 10px" : "10px 14px",
    zIndex: 20,
  };
  const groupStyle = {
    display: "flex",
    alignItems: "center",
    gap: compact ? 6 : 10,
    paddingRight: compact ? 8 : 14,
    marginRight: compact ? 4 : 8,
    borderRight: "1px solid #eee",
  };
  const btn = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: compact ? "6px 8px" : "8px 12px",
    borderRadius: 8,
    background: "#fff",
    border: "1px solid #d1d5db",
    cursor: "pointer",
    fontSize: 14,
  };
  const label = (t) => (compact ? null : <span>{t}</span>);

  const IconChevron = ({ up = false }) => (
    <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, display: "inline-block" }}>
      <path d={up ? "M7 14l5-5 5 5" : "M7 10l5 5 5-5"} fill="currentColor" />
    </svg>
  );

  return (
    <div style={layoutStyle}>
      <div id="map" style={{ height: "100dvh", width: "100%" }} />

      <div
        style={{
          padding: sideOpen ? 16 : 0,
          borderLeft: sideOpen ? "1px solid #eee" : "none",
          overflowY: "auto",
          display: sideOpen ? "block" : "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h1 style={{ margin: 0, fontSize: 18 }}>Assolia Telepac Mapper</h1>
            <button
              type="button"
              onClick={handleRequestWeather}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #38bdf8",
                background: "#0ea5e9",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 10px 30px rgba(14,165,233,0.25)",
              }}
            >
              Ouvrir la fenêtre météo
            </button>
            <button
              type="button"
              onClick={onOpenSummary}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #34d399",
                background: "#22c55e",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 10px 30px rgba(34,197,94,0.25)",
              }}
            >
              Voir la synthèse météo
            </button>
          </div>

          <button
            onClick={() => setSideOpen(false)}
            title="Replier le panneau"
            style={{
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            ◀
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 12, marginBottom: 8 }}>
          <button
            onClick={() => setActiveTab("parcelles")}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: activeTab === "parcelles" ? "#eef6ff" : "#fff",
              cursor: "pointer",
            }}
          >
            Parcelles
          </button>
          <button
            onClick={() => setActiveTab("calques")}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: activeTab === "calques" ? "#ffeeeeff" : "#fff",
              cursor: "pointer",
            }}
          >
            Calques
          </button>
        </div>

        <RpgFeature mapRef={mapRef} drawRef={drawRef} />

        {activeTab === "parcelles" && (
          <>
            <p style={{ color: "#666", marginTop: 0 }}>
              • «&nbsp;Importer XML Télépac&nbsp;» pour charger un export.
              <br />
              • «&nbsp;Dessiner un polygone&nbsp;» pour ajouter une parcelle.
              <br />• «&nbsp;Exporter XML Télépac&nbsp;» pour générer un fichier
              compatible Assolia.
            </p>

            <ParcelleEditor
              features={features}
              setFeatures={setFeatures}
              selectedId={selectedId}
              onSelect={(id) => selectFeatureOnMap(id, true)}
              onRequestWeather={handleRequestWeather}
            />

            <p style={{ fontSize: 12, color: "#777", marginTop: 10 }}>
              Astuce : clique une fiche pour surligner la parcelle sur la carte
              (et inversement).
            </p>
          </>
        )}

        {activeTab === "calques" && (
          <div style={{ marginTop: 6 }}>
            <span
              style={{ cursor: "default", fontWeight: 600, padding: "6px 0" }}
            >
              Calques
            </span>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              <RasterToggles mapRef={mapRef} />
              <WeatherStationsToggle mapRef={mapRef} />
            </div>
          </div>
        )}
      </div>

      {!sideOpen && (
        <button
          onClick={() => setSideOpen(true)}
          title="Déplier le panneau latéral"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 15,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
            boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
          }}
        >
          ▶
        </button>
      )}

      <div style={barBase}>
        <div style={groupStyle}>
          <ImportTelepacButton
            mapRef={mapRef}
            drawRef={drawRef}
            setFeatures={setFeatures}
            selectFeatureOnMap={selectFeatureOnMap}
            compact={compact}
            buttonStyle={btn}
          />
          <ExportTelepacButton
            features={features}
            compact={compact}
            buttonStyle={{ ...btn, background: "#111", color: "#fff", border: "none" }}
          />
        </div>

        <div style={{ ...groupStyle, borderRight: "none" }}>
          <DrawToolbar
            mapRef={mapRef}
            drawRef={drawRef}
            features={features}
            setFeatures={setFeatures}
            selectFeatureOnMap={selectFeatureOnMap}
            compact={compact}
          />
        </div>

        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={() => setCompact((v) => !v)}
            style={btn}
            title={compact ? "Agrandir le panneau" : "Réduire en barre d’outils"}
          >
            <IconChevron up={compact} />
            {label(compact ? "Agrandir" : "Réduire")}
          </button>
        </div>
      </div>

      <WeatherModal
        open={weatherModalOpen}
        onClose={() => setWeatherModalOpen(false)}
        parcelLabel={selectedInfo.label}
        centroid={selectedInfo.centroid}
        station={nearestStation}
        stationLoading={stationsState.loading}
        stationError={stationsState.error}
        onRetryStation={fetchStations}
        yearOptions={yearOptions}
        selectedYears={selectedYears}
        onToggleYear={handleToggleYear}
        loadingYears={loadingYears}
        weatherByYear={weatherDatasets}
        yearErrors={yearErrors}
        onRetryYear={handleRetryYear}
      />
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("map");

  if (view === "summary") {
    return <WeatherSummaryPage onReturn={() => setView("map")} />;
  }

  return <MapExperience onOpenSummary={() => setView("summary")} />;
}
