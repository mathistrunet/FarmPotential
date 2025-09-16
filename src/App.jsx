// src/App.jsx
import React, { useRef, useState } from "react";

import RasterToggles from "./components/RasterToggles";
import ParcelleEditor from "./components/ParcelleEditor";
import { useMapInitialization } from "./features/map/useMapInitialization";
import WeatherModal from "./components/WeatherModal";
import { fetchWeatherSummary } from "./services/weather";
import { ringCentroidLonLat } from "./utils/geometry";

// ⛔️ Fonctionnalités sols retirées pour focaliser cette branche sur la météo locale

// ✅ composant RPG autonome (chemin conservé)
import RpgFeature from "./Front/useRpgLayer";
// ✅ composant Dessin autonome (chemin conservé)
import DrawToolbar from "./Front/DrawToolbar";
// ✅ Import/Export Télépac (chemin conservé)
import ImportTelepacButton, { ExportTelepacButton } from "./Front/TelepacButton";

export default function App() {
  const {
    mapRef,
    drawRef,
    features,
    setFeatures,
    selectedId,
    selectFeatureOnMap,
  } = useMapInitialization();

  // Onglets + panneau latéral repliable
  const [sideOpen, setSideOpen] = useState(true);          // panneau latéral ouvert/fermé
  const [activeTab, setActiveTab] = useState("parcelles"); // "parcelles" | "calques"
  const [compact, setCompact] = useState(false);
  const [weatherModal, setWeatherModal] = useState({
    open: false,
    parcelId: null,
    label: "",
    coordinates: null,
  });
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(null);
  const weatherAbortRef = useRef(null);
  // ---- Styles de la barre d’outils bas
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

  const handleRequestWeather = (featureId, labelText) => {
    const displayLabel = labelText?.trim() || `Parcelle ${featureId ?? ""}`.trim() || "Parcelle";

    setWeatherModal({
      open: true,
      parcelId: featureId,
      label: displayLabel,
      coordinates: null,
    });
    setWeatherLoading(true);
    setWeatherError(null);
    setWeatherData(null);

    if (weatherAbortRef.current) {
      weatherAbortRef.current.abort();
      weatherAbortRef.current = null;
    }

    const feature = features.find((f, idx) => (f.id ?? idx) === featureId);

    if (!feature) {
      setWeatherLoading(false);
      setWeatherError("Parcelle introuvable dans la carte.");
      return;
    }

    const ring = feature.geometry?.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length < 3) {
      setWeatherLoading(false);
      setWeatherError("La géométrie de la parcelle est incomplète.");
      return;
    }

    const centroid = ringCentroidLonLat(ring);
    if (!centroid) {
      setWeatherLoading(false);
      setWeatherError("Impossible de localiser la parcelle pour la météo.");
      return;
    }

    const [lon, lat] = centroid;
    setWeatherModal((prev) => ({
      ...prev,
      coordinates: { latitude: lat, longitude: lon },
    }));

    selectFeatureOnMap(featureId, true);

    const controller = new AbortController();
    weatherAbortRef.current = controller;

    fetchWeatherSummary({ latitude: lat, longitude: lon, signal: controller.signal })
      .then((data) => {
        weatherAbortRef.current = null;
        setWeatherData(data);
        setWeatherError(null);
        setWeatherLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        weatherAbortRef.current = null;
        setWeatherError(
          err?.message ||
            "Impossible de récupérer les relevés météo pour cette parcelle."
        );
        setWeatherLoading(false);
      });
  };

  const handleCloseWeather = () => {
    if (weatherAbortRef.current) {
      weatherAbortRef.current.abort();
      weatherAbortRef.current = null;
    }
    setWeatherModal({ open: false, parcelId: null, label: "", coordinates: null });
    setWeatherData(null);
    setWeatherError(null);
    setWeatherLoading(false);
  };

  // Petites icônes (chevron uniquement ici)
  const iconStyle = {
    width: 18,
    height: 18,
    display: "inline-block",
    verticalAlign: "-3px",
  };
  const IconChevron = ({ up = false }) => (
    <svg viewBox="0 0 24 24" style={iconStyle}>
      <path d={up ? "M7 14l5-5 5 5" : "M7 10l5 5 5-5"} fill="currentColor" />
    </svg>
  );

  // ---- Layout racine (grille 2 colonnes conditionnelle)
  const layoutStyle = {
    height: "100%",
    position: "relative",
    display: "grid",
    gridTemplateColumns: sideOpen ? "1fr 420px" : "1fr 0px",
  };

  return (
    <div style={layoutStyle}>
      {/* Carte */}
      <div id="map" style={{ height: "100dvh", width: "100%" }} />

      {/* ⛔️ Panneau d’info sols supprimé pour laisser place aux futures données météo */}

      {/* Panneau latéral (onglets + repliable) */}
      <div
        style={{
          padding: sideOpen ? 16 : 0,
          borderLeft: sideOpen ? "1px solid #eee" : "none",
          overflowY: "auto",
          display: sideOpen ? "block" : "none",
        }}
      >
        {/* En-tête + bouton pour replier */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 18 }}>Assolia Telepac Mapper</h1>
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

        {/* Onglets */}
        <div
          style={{ display: "flex", gap: 6, marginTop: 12, marginBottom: 8 }}
        >
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

        {/* RPG (autonome) */}
        <RpgFeature mapRef={mapRef} drawRef={drawRef} />

        {/* Contenu onglet “Parcelles” */}
        {activeTab === "parcelles" && (
          <>
            <p style={{ color: "#666", marginTop: 0 }}>
              • “Importer XML Télépac” pour charger un export.
              <br />
              • “Dessiner un polygone” pour ajouter une parcelle.
              <br />• “Exporter XML Télépac” pour générer un fichier compatible
              Assolia.
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

        {/* Calques (hors sols en ligne ; on garde les rasters/basemaps locaux ou tiers) */}
        {activeTab === "calques" && (
          <div style={{ marginTop: 6 }}>
            <span
              style={{ cursor: "default", fontWeight: 600, padding: "6px 0" }}
            >
              Calques
            </span>
            <div style={{ marginTop: 8 }}>
              <RasterToggles mapRef={mapRef} />
              {/* ⛔️ Fonctionnalités sols retirées pour focaliser cette branche sur la météo */}
            </div>
          </div>
        )}
      </div>

      {/* Bouton flottant pour ouvrir le panneau quand il est fermé */}
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

      {/* Barre d’outils bas */}
      <div style={barBase}>
        {/* Import / Export Télépac */}
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

        {/* Dessin */}
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
        open={weatherModal.open}
        onClose={handleCloseWeather}
        parcelLabel={weatherModal.label}
        loading={weatherLoading}
        error={weatherError}
        weather={weatherData}
        coordinates={weatherModal.coordinates}
      />
    </div>
  );
}
