// src/App.jsx
import React, { useEffect, useRef, useState } from "react";

import RasterToggles from "./components/RasterToggles";
import ParcelleEditor from "./components/ParcelleEditor";
import { useMapInitialization } from "./features/map/useMapInitialization";
import SoilsControl from "./features/soils/components/SoilsControl";
import { useSoilsLayer } from "./features/soils/hooks/useSoilsLayer";

// ✅ composant RPG autonome (chemin corrigé)
import RpgFeature from "./Front/useRpgLayer";
// ✅ composant Dessin autonome (chemin corrigé)
import DrawToolbar from "./Front/DrawToolbar";
// ✅ Import/Export Télépac (chemin corrigé)
import ImportTelepacButton, { ExportTelepacButton } from "./Front/TelepacButton";
import SoilInfoPanel from "./components/SoilInfoPanel";
import { getRrpAtPoint } from "./utils/rrpGetFeatureInfo";

export default function App() {
  const {
    mapRef,
    drawRef,
    features,
    setFeatures,
    selectedId,
    selectFeatureOnMap,
  } = useMapInitialization();

  const {
    visible: soilsVisible,
    toggle: toggleSoils,
    layerId: soilsLayerId,
    setLayerId: setSoilsLayerId,
  } = useSoilsLayer(mapRef);

  // Onglets + panneau latéral repliable
  const [sideOpen, setSideOpen] = useState(true);          // panneau latéral ouvert/fermé
  const [activeTab, setActiveTab] = useState("parcelles"); // "parcelles" | "calques"
  const [compact, setCompact] = useState(false);

  const [soilInfo, setSoilInfo] = useState(null);
  const soilAbortRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e) => {
      if (soilAbortRef.current) soilAbortRef.current.abort();
      const controller = new AbortController();
      soilAbortRef.current = controller;
      setSoilInfo({ loading: true });
      getRrpAtPoint(map, e.point, { signal: controller.signal })
        .then((data) => setSoilInfo({ loading: false, ...data }))
        .catch((err) => {
          if (err.name === "AbortError") return;
          setSoilInfo({ loading: false, error: true });
        });
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
      if (soilAbortRef.current) soilAbortRef.current.abort();
    };
  }, [mapRef]);

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
      <SoilInfoPanel info={soilInfo} />

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
            Calques en ligne
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

        {/* Calques en ligne */}
        <div style={{ marginTop: 6 }}>
          <span
            style={{ cursor: "default", fontWeight: 600, padding: "6px 0" }}
          >
            Calques en ligne
          </span>
          <div style={{ marginTop: 8 }}>
            <RasterToggles mapRef={mapRef} />
            <SoilsControl
              visible={soilsVisible}
              toggle={toggleSoils}
              layerId={soilsLayerId}
              setLayerId={setSoilsLayerId}
            />
          </div>
        </div>
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
        {/* Import / Export Télépac : délégué aux nouveaux composants */}
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

        {/* Dessin : délégué au composant autonome */}
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
