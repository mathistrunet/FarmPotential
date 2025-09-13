// src/App.jsx
import React, { useEffect, useState } from "react";
import maplibregl from "maplibre-gl";

import RasterToggles from "./components/RasterToggles";
import ParcelleEditor from "./components/ParcelleEditor";
import { useMapInitialization } from "./features/map/useMapInitialization";
import { DEFAULT_FILL_OPACITY } from "./config/soilsLocalConfig";

// ⛔️ retirés car liés aux calques/queries en ligne (Géoportail)
// import SoilsControl from "./features/soils/components/SoilsControl";
// import { useSoilsLayer } from "./features/soils/hooks/useSoilsLayer";
// import SoilInfoPanel from "./components/SoilInfoPanel";
// import { getRrpAtPoint } from "./utils/rrpGetFeatureInfo";

// ✅ composant RPG autonome (chemin conservé)
import RpgFeature from "./Front/useRpgLayer";
// ✅ composant Dessin autonome (chemin conservé)
import DrawToolbar from "./Front/DrawToolbar";
// ✅ Import/Export Télépac (chemin conservé)
import ImportTelepacButton, { ExportTelepacButton } from "./Front/TelepacButton";

// ✅ NOUVEAU : hook d’affichage RRP local (depuis un ZIP placé dans /public/data)
import { useSoilLayerLocal } from "./features/useSoilLayerLocal";

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
  const [rrpVisible, setRrpVisible] = useState(true);
  const [rrpOpacity, setRrpOpacity] = useState(DEFAULT_FILL_OPACITY);
  const [rrpFrVisible, setRrpFrVisible] = useState(false);
  const [rrpFrOpacity, setRrpFrOpacity] = useState(DEFAULT_FILL_OPACITY);

  // ✅ expose maplibregl pour les popups utilisés par le hook local
  useEffect(() => {
    (window).maplibregl = maplibregl;
  }, []);

  // ✅ Charge la couche RRP France depuis un ZIP local (placer le fichier dans /public/data/)
  //    Exemple : public/data/rrp_france_wgs84_shp.zip
  useSoilLayerLocal({
    map: mapRef.current,
    zipUrl: "/data/rrp_france_wgs84_shp.zip",
    sourceId: "soils-rrp",
    fillLayerId: "soils-rrp-fill",
    lineLayerId: "soils-rrp-outline",
    labelLayerId: "soils-rrp-label",
    zIndex: 10,
    visible: rrpVisible,
    fillOpacity: rrpOpacity,
  });

  useSoilLayerLocal({
    map: mapRef.current,
    zipUrl: "/data/rrp_france_wgs84_shp.zip",
    sourceId: "soils-rrp-fr",
    fillLayerId: "soils-rrp-fr-fill",
    lineLayerId: "soils-rrp-fr-outline",
    labelLayerId: "soils-rrp-fr-label",
    zIndex: 9,
    visible: rrpFrVisible,
    fillOpacity: rrpFrOpacity,
  });

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

      {/* ⛔️ retiré : panneau d’info sols alimenté par GetFeatureInfo distant */}
      {/* <SoilInfoPanel info={soilInfo} /> */}

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
              <div
                style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: 8,
                  marginTop: 8,
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={rrpVisible}
                    onChange={(e) => setRrpVisible(e.target.checked)}
                  />
                  <span>Carte des sols RRP France</span>
                </label>
                <p style={{ color: "#666", fontSize: 12, marginTop: 8 }}>
                  Chargée depuis <code>/public/data/rrp_france_wgs84_shp.zip</code>.
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 6,
                  }}
                >
                  <span style={{ fontSize: 12, color: "#666" }}>Opacité</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={rrpOpacity}
                    onInput={(e) => {
                      const v = parseFloat(e.currentTarget.value);
                      setRrpOpacity(v);
                      const map = mapRef.current;
                      if (map) map.setPaintProperty("soils-rrp-fill", "fill-opacity", v);
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
              <div
                style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: 8,
                  marginTop: 8,
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={rrpFrVisible}
                    onChange={(e) => setRrpFrVisible(e.target.checked)}
                  />
                  <span>Carte des sols France</span>
                </label>
                <p style={{ color: "#666", fontSize: 12, marginTop: 8 }}>
                  Chargée depuis <code>/public/data/rrp_france_wgs84_shp.zip</code>.
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 6,
                  }}
                >
                  <span style={{ fontSize: 12, color: "#666" }}>Opacité</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={rrpFrOpacity}
                    onInput={(e) => {
                      const v = parseFloat(e.currentTarget.value);
                      setRrpFrOpacity(v);
                      const map = mapRef.current;
                      if (map) map.setPaintProperty("soils-rrp-fr-fill", "fill-opacity", v);
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
              {/* ⛔️ retiré : contrôle sols en ligne (WMS/WFS) */}
              {/* <SoilsControl ... /> */}
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
    </div>
  );
}
