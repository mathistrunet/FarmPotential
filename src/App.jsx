import { Suspense, lazy, useState } from "react";

import ParcellesViewerMap from "./maps/parcelles/ParcellesViewerMap";
import { ParcellesProvider } from "./maps/parcelles/ParcellesStore";
import { useParcelles } from "./maps/parcelles/useParcelles";

const ParcellesEditorMap = lazy(() => import("./maps/parcelles/ParcellesEditorMap"));

function AppContent() {
  const { parcellesCollection } = useParcelles();
  const [mapMode, setMapMode] = useState("editor");

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 30,
          display: "flex",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={() => setMapMode("viewer")}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: mapMode === "viewer" ? "#111" : "#fff",
            color: mapMode === "viewer" ? "#fff" : "#111",
            cursor: "pointer",
          }}
        >
          Viewer
        </button>
        <button
          type="button"
          onClick={() => setMapMode("editor")}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: mapMode === "editor" ? "#111" : "#fff",
            color: mapMode === "editor" ? "#fff" : "#111",
            cursor: "pointer",
          }}
        >
          Editor
        </button>
      </div>

      {mapMode === "viewer" ? (
        <ParcellesViewerMap data={parcellesCollection} isActive />
      ) : (
        <Suspense fallback={<div style={{ padding: 24 }}>Chargement de l'editor...</div>}>
          <ParcellesEditorMap />
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ParcellesProvider>
      <AppContent />
    </ParcellesProvider>
  );
}
