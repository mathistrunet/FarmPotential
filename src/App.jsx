// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import maplibregl from "maplibre-gl";

import RasterToggles from "./components/RasterToggles";
import ParcelleEditor from "./components/ParcelleEditor";
import { useMapInitialization } from "./features/map/useMapInitialization";
import { DEFAULT_FILL_OPACITY } from "./config/soilsLocalConfig";
import { GEO_PORTAIL_SOIL_DEFAULT_OPACITY } from "./config/soilGeoportal";

// ⛔️ retirés car liés aux calques/queries en ligne (Géoportail)
// import SoilsControl from "./features/soils/components/SoilsControl";
// import { useSoilsLayer } from "./features/soils/hooks/useSoilsLayer";
import SoilInfoPanel from "./components/SoilInfoPanel";
// import { getRrpAtPoint } from "./utils/rrpGetFeatureInfo";

// ✅ composant RPG autonome (chemin conservé)
import RpgFeature from "./Front/useRpgLayer";
// ✅ composant Dessin autonome (chemin conservé)
import DrawToolbar from "./Front/DrawToolbar";
// ✅ Import/Export Télépac (chemin conservé)
import ImportTelepacButton from "./Front/TelepacButton";
import ExportMenuButton from "./Front/ExportMenuButton";

// ✅ NOUVEAU : hook d’affichage RRP local (depuis un fichier MBTiles placé dans /public/data)
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
  const [sideExpanded, setSideExpanded] = useState(false); // largeur étendue pour le tableau
  const [activeTab, setActiveTab] = useState("parcelles"); // "parcelles" | "calques"
  const [parcelleViewMode, setParcelleViewMode] = useState("cards"); // "cards" | "table"
  const [compact, setCompact] = useState(false);
  const [rrpVisible, setRrpVisible] = useState(false);
  const [rrpOpacity, setRrpOpacity] = useState(DEFAULT_FILL_OPACITY);
  const [geoportalOpacity, setGeoportalOpacity] = useState(
    GEO_PORTAIL_SOIL_DEFAULT_OPACITY
  );
  const [freezeTiles, setFreezeTiles] = useState(false);
  const [soilClickInfo, setSoilClickInfo] = useState(null);

  useEffect(() => {
    if (!sideOpen) {
      setSideExpanded(false);
    }
  }, [sideOpen]);

  useEffect(() => {
    if (parcelleViewMode === "table" && sideOpen) {
      setSideExpanded(true);
    } else if (parcelleViewMode !== "table") {
      setSideExpanded(false);
    }
  }, [parcelleViewMode, sideOpen]);

  // ✅ expose maplibregl pour les popups utilisés par le hook local
  useEffect(() => {
    (window).maplibregl = maplibregl;
  }, []);

  // ✅ Charge la couche RRP France depuis un fichier MBTiles local (placer le fichier dans /public/data/)
  //    Exemple : public/data/rrp_france_wgs84_shp.mbtiles
  const {
    polygonsShown,
    loadingTiles,
    freezeCurrentTile,
    frozenTiles,
    removeFrozenTile,
    clearFrozenTiles,
    currentTileSummary,
  } = useSoilLayerLocal({
    map: mapRef.current,
    dataPath: "/data/soilmap_dep",
    sourceId: "soils-rrp",
    fillLayerId: "soils-rrp-fill",
    lineLayerId: "soils-rrp-outline",
    labelLayerId: "soils-rrp-label",
    zIndex: 10,
    visible: rrpVisible,
    fillOpacity: rrpOpacity,
    freezeTiles,
    geoportalOpacity,
  });

  const mapInstance = mapRef.current;

  useEffect(() => {
    if (!mapInstance) return;

    const handleClick = (event) => {
      if (!rrpVisible) {
        setSoilClickInfo(null);
        return;
      }
      const features = mapInstance.queryRenderedFeatures(event.point, {
        layers: ["soils-rrp-fill"],
      });
      const items = features.map((feature, idx) => ({
        id:
          feature.id ??
          feature.properties?.id ??
          feature.properties?.ID ??
          `${feature.source}-${feature.sourceLayer ?? ""}-${idx}`,
        properties: { ...(feature.properties ?? {}) },
      }));
      setSoilClickInfo({
        lngLat:
          event.lngLat && typeof event.lngLat.wrap === "function"
            ? event.lngLat.wrap()
            : event.lngLat,
        features: items,
      });
    };

    mapInstance.on("click", handleClick);

    return () => {
      mapInstance.off("click", handleClick);
    };
  }, [mapInstance, rrpVisible]);

  useEffect(() => {
    if (!rrpVisible) {
      setSoilClickInfo(null);
    }
  }, [rrpVisible]);

  const totalFrozenFeatures = useMemo(
    () => frozenTiles.reduce((acc, tile) => acc + tile.features.length, 0),
    [frozenTiles]
  );

  const totalVisibleFeatures =
    totalFrozenFeatures + (currentTileSummary?.featureCount ?? 0);

  const soilStatusLabel = (() => {
    if (!rrpVisible) return "couche désactivée";
    if (loadingTiles) return "chargement des tuiles…";
    if (freezeTiles && totalVisibleFeatures === 0)
      return "rechargement en pause – aucune tuile visible";
    if (freezeTiles) return "rechargement en pause";
    if (totalVisibleFeatures === 0) return "aucune tuile visible";
    if (frozenTiles.length > 0) {
      return `tuiles figées (${frozenTiles.length}) + tuile active`;
    }
    return polygonsShown ? "tuile active affichée" : "aucune tuile visible";
  })();

  const canFreezeCurrentTile = Boolean(currentTileSummary?.featureCount);

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
    gridTemplateColumns: sideOpen
      ? sideExpanded
        ? "minmax(320px, 45%) minmax(420px, 55%)"
        : "1fr 420px"
      : "1fr 0px",
  };

  return (
    <div style={layoutStyle}>
      {/* Carte */}
      <div id="map" style={{ height: "100dvh", width: "100%" }} />

      <SoilInfoPanel info={soilClickInfo} onClose={() => setSoilClickInfo(null)} />

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
            onClick={() => {
              setSideOpen(false);
              setParcelleViewMode("cards");
            }}
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
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, color: "#555" }}>Affichage</span>
              <div
                style={{
                  display: "inline-flex",
                  border: "1px solid #d1d5db",
                  borderRadius: 999,
                  padding: 2,
                  background: "#f9fafb",
                }}
              >
                <button
                  type="button"
                  onClick={() => setParcelleViewMode("cards")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "none",
                    cursor: "pointer",
                    background:
                      parcelleViewMode === "cards" ? "#2563eb" : "transparent",
                    color: parcelleViewMode === "cards" ? "#fff" : "#111",
                    fontSize: 12,
                  }}
                >
                  Fiches
                </button>
                <button
                  type="button"
                  onClick={() => setParcelleViewMode("table")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "none",
                    cursor: "pointer",
                    background:
                      parcelleViewMode === "table" ? "#2563eb" : "transparent",
                    color: parcelleViewMode === "table" ? "#fff" : "#111",
                    fontSize: 12,
                  }}
                >
                  Tableau
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSideExpanded((v) => !v)}
                style={{
                  marginLeft: "auto",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: sideExpanded ? "#eef2ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  display: parcelleViewMode === "table" ? "inline-flex" : "none",
                }}
              >
                {sideExpanded ? "Réduire" : "Agrandir"}
              </button>
            </div>
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
              viewMode={parcelleViewMode}
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
                  <span>Carte des sols France</span>
                </label>
                <p style={{ color: "#666", fontSize: 12, marginTop: 8 }}>
                  Chargée depuis <code>/public/data/rrp_france_wgs84_shp.mbtiles</code>.
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 6,
                  }}
                >
                  <span style={{ fontSize: 12, color: "#666" }}>
                    Opacité couleurs Géoportail
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={geoportalOpacity}
                    onInput={(e) => {
                      const v = parseFloat(e.currentTarget.value);
                      setGeoportalOpacity(v);
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ marginTop: 8 }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      color: "#444",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={freezeTiles}
                      onChange={(e) => setFreezeTiles(e.target.checked)}
                      disabled={!rrpVisible}
                    />
                    <span>Mettre en pause le rechargement automatique</span>
                  </label>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: 12,
                    color: "#444",
                    marginTop: 8,
                  }}
                >
                  <div>Statut : {soilStatusLabel}</div>
                  <div>
                    Tuile visible : {currentTileSummary
                      ? `${currentTileSummary.featureCount} polygone${
                          currentTileSummary.featureCount > 1 ? "s" : ""
                        }`
                      : "—"}
                  </div>
                  <div>
                    Tuiles figées : {frozenTiles.length} ({totalFrozenFeatures} polygone
                    {totalFrozenFeatures > 1 ? "s" : ""})
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    marginTop: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => freezeCurrentTile()}
                    disabled={!rrpVisible || !canFreezeCurrentTile}
                    style={{
                      padding: "6px 10px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: canFreezeCurrentTile ? "#fff" : "#f3f4f6",
                      cursor:
                        rrpVisible && canFreezeCurrentTile ? "pointer" : "not-allowed",
                      opacity: rrpVisible && canFreezeCurrentTile ? 1 : 0.6,
                      transition: "background-color 0.2s ease",
                    }}
                    title="Ajoute la tuile actuellement visible à la liste des tuiles figées"
                  >
                    Figer la tuile visible
                  </button>
                  <button
                    type="button"
                    onClick={() => clearFrozenTiles()}
                    disabled={!frozenTiles.length}
                    style={{
                      padding: "6px 10px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: frozenTiles.length ? "#fff" : "#f3f4f6",
                      cursor: frozenTiles.length ? "pointer" : "not-allowed",
                      opacity: frozenTiles.length ? 1 : 0.6,
                    }}
                    title="Supprime toutes les tuiles figées"
                  >
                    Vider les tuiles figées
                  </button>
                </div>
                {frozenTiles.length > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      borderTop: "1px solid #eee",
                      paddingTop: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 12,
                      color: "#444",
                    }}
                  >
                    <strong style={{ fontSize: 12 }}>
                      Tuiles figées ({frozenTiles.length})
                    </strong>
                    <ul
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {frozenTiles.map((tile, index) => (
                        <li
                          key={tile.id}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 6,
                            padding: 6,
                            background: "#fafafa",
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>
                            #{index + 1} – {tile.features.length} polygone
                            {tile.features.length > 1 ? "s" : ""}
                          </div>
                          <div style={{ color: "#666" }}>
                            Centre : {tile.center[1].toFixed(4)}°, {tile.center[0].toFixed(4)}°
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFrozenTile(tile.id)}
                            style={{
                              marginTop: 6,
                              padding: "4px 8px",
                              fontSize: 12,
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              background: "#fff",
                              cursor: "pointer",
                            }}
                          >
                            Retirer cette tuile
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
          <ExportMenuButton
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
