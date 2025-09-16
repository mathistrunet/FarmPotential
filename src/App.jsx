// src/App.jsx
import React, { useMemo, useState } from "react";


import RasterToggles from "./components/RasterToggles";
import ParcelleEditor from "./components/ParcelleEditor";
import { useMapInitialization } from "./features/map/useMapInitialization";
import WeatherModal from "./components/WeatherModal";
import { fetchWeatherSummary } from "./services/weather";
import { ringCentroidLonLat } from "./utils/geometry";

// ✅ composant RPG autonome (chemin conservé)
import RpgFeature from "./Front/useRpgLayer";
// ✅ composant Dessin autonome (chemin conservé)
import DrawToolbar from "./Front/DrawToolbar";
// ✅ Import/Export Télépac (chemin conservé)
import ImportTelepacButton, { ExportTelepacButton } from "./Front/TelepacButton";

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

function WeatherWindow({ open, onClose, hasSelection, parcelLabel, centroid }) {
  if (!open) return null;

  const boxStyle = {
    width: "min(640px, 92vw)",
    maxHeight: "85vh",
    padding: "24px 28px",
    borderRadius: 16,
    background: "#ffffff",
    boxShadow: "0 24px 80px rgba(15,23,42,0.35)",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  };

  const closeBtnStyle = {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #cbd5f5",
    background: "#f8fafc",
    color: "#1e3a8a",
    cursor: "pointer",
    fontWeight: 600,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={boxStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
          }}
        >
          <h2 style={{ margin: 0 }}>Fenêtre météo</h2>
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            Fermer
          </button>
        </div>

        {hasSelection ? (
          <div style={{ fontSize: 14, color: "#1f2937", lineHeight: 1.6 }}>
            <p>
              Parcelle sélectionnée : <strong>{parcelLabel}</strong>
            </p>
            {centroid ? (
              <p style={{ marginTop: 8 }}>
                Position approximative :
                <br />
                Latitude : {centroid.latitude.toFixed(5)}°
                <br />
                Longitude : {centroid.longitude.toFixed(5)}°
              </p>
            ) : (
              <p style={{ marginTop: 8 }}>
                Impossible de déterminer les coordonnées de cette parcelle pour
                l&apos;instant.
              </p>
            )}

            <div
              style={{
                marginTop: 18,
                padding: "12px 16px",
                borderRadius: 12,
                background: "#f1f5f9",
                border: "1px dashed #94a3b8",
              }}
            >
              <p style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>
                Les relevés météo des 12 derniers mois s&apos;afficheront ici.
              </p>
              <p style={{ margin: "8px 0 0", color: "#475569" }}>
                Cette fenêtre est prête à accueillir les informations météo les
                plus proches de votre parcelle sélectionnée.
              </p>
            </div>
          </div>
        ) : (
          <div
            style={{
              fontSize: 14,
              color: "#1f2937",
              lineHeight: 1.6,
              padding: "18px 20px",
              borderRadius: 12,
              background: "#fef9c3",
              border: "1px solid #facc15",
            }}
          >
            Sélectionnez une parcelle sur la carte pour préparer l&apos;affichage
            des données météo.
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const {
    mapRef,
    drawRef,
    features,
    setFeatures,
    selectedId,
    selectFeatureOnMap,
    mapReady,
  } = useMapInitialization();

  const [sideOpen, setSideOpen] = useState(true); // panneau latéral ouvert/fermé
  const [activeTab, setActiveTab] = useState("parcelles"); // "parcelles" | "calques"
  const [compact, setCompact] = useState(false);
  const [weatherWindowOpen, setWeatherWindowOpen] = useState(false);

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
              onClick={() => setWeatherWindowOpen(true)}
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
            <div style={{ marginTop: 8 }}>
              <RasterToggles mapRef={mapRef} />
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

      <WeatherWindow
        open={weatherWindowOpen}
        onClose={() => setWeatherWindowOpen(false)}
        hasSelection={!!selectedInfo.feature}
        parcelLabel={selectedInfo.label}
        centroid={selectedInfo.centroid}
      />
    </div>
  );
}
