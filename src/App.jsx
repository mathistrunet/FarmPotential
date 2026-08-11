import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";

import AppTopBar from "./components/AppTopBar";
import GuideModal from "./components/GuideModal";
import ParcellesViewerMap from "./maps/parcelles/ParcellesViewerMap";
import { ParcellesProvider } from "./maps/parcelles/ParcellesStore";
import { useParcelles } from "./maps/parcelles/useParcelles";
import { normalizeParcellesCollection } from "./maps/parcelles/parcellesData";
import { buildDeterministicPalette } from "./maps/parcelles/parcellesLayers";

const ParcellesEditorMap = lazy(() => import("./maps/parcelles/ParcellesEditorMap"));
const UNKNOWN_YEAR = "unknown";
// Le guide s'ouvre tout seul à la première utilisation sur ce poste ; ensuite il
// reste accessible par le bouton « Guide ».
const GUIDE_SEEN_KEY = "studioparcellaire.guide-vu.v1";

function normalizeYearValue(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function AppContent() {
  const { parcellesCollection } = useParcelles();
  const [mapMode, setMapMode] = useState("editor");
  const [guideOpen, setGuideOpen] = useState(false);
  const [viewerYearFilter, setViewerYearFilter] = useState("all");
  const [viewerCultures, setViewerCultures] = useState([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!window.localStorage.getItem(GUIDE_SEEN_KEY)) setGuideOpen(true);
    } catch {
      /* stockage local indisponible (navigation privée) : on n'ouvre rien */
    }
  }, []);

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    try {
      window.localStorage.setItem(GUIDE_SEEN_KEY, "1");
    } catch {
      /* sans stockage local, le guide se rouvrira à la prochaine session */
    }
  }, []);

  const normalizedViewerCollection = useMemo(
    () => normalizeParcellesCollection(parcellesCollection),
    [parcellesCollection]
  );

  const yearOptions = useMemo(() => {
    const years = new Set();
    let hasUnknown = false;
    (normalizedViewerCollection?.features || []).forEach((feature) => {
      const year = normalizeYearValue(feature?.properties?.annee);
      if (year == null) {
        hasUnknown = true;
        return;
      }
      years.add(year);
    });
    return { years: Array.from(years).sort((a, b) => b - a), hasUnknown };
  }, [normalizedViewerCollection]);

  useEffect(() => {
    if (viewerYearFilter === "all") return;
    if (viewerYearFilter === UNKNOWN_YEAR && yearOptions.hasUnknown) return;
    const parsed = normalizeYearValue(viewerYearFilter);
    if (parsed != null && yearOptions.years.includes(parsed)) return;
    setViewerYearFilter("all");
  }, [viewerYearFilter, yearOptions]);

  const cultureOptions = useMemo(() => {
    const selectedYear = viewerYearFilter;
    const values = new Set();
    (normalizedViewerCollection?.features || []).forEach((feature) => {
      const props = feature?.properties || {};
      const year = normalizeYearValue(props.annee);
      if (selectedYear === UNKNOWN_YEAR) {
        if (year != null) return;
      } else if (selectedYear !== "all") {
        const targetYear = normalizeYearValue(selectedYear);
        if (targetYear != null && year !== targetYear) return;
      }

      const culture = String(props.culture || "").trim();
      if (culture) values.add(culture);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "fr"));
  }, [normalizedViewerCollection, viewerYearFilter]);

  useEffect(() => {
    setViewerCultures((prev) => prev.filter((culture) => cultureOptions.includes(culture)));
  }, [cultureOptions]);

  const legendPalette = useMemo(
    () => buildDeterministicPalette(cultureOptions),
    [cultureOptions]
  );

  const toggleCulture = (culture) => {
    setViewerCultures((prev) =>
      prev.includes(culture) ? prev.filter((item) => item !== culture) : [...prev, culture]
    );
  };

  const viewerFilters = useMemo(
    () => ({ year: viewerYearFilter, cultures: viewerCultures }),
    [viewerYearFilter, viewerCultures]
  );

  const parcelCount = normalizedViewerCollection?.features?.length ?? 0;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {mapMode === "viewer" ? (
        <>
          <AppTopBar
            mode={mapMode}
            onModeChange={setMapMode}
            onOpenGuide={() => setGuideOpen(true)}
            parcelCount={parcelCount}
          />

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: "320px 1fr",
            }}
          >
            <aside
              style={{
                borderRight: "1px solid var(--c-border)",
                background: "var(--c-surface)",
                overflowY: "auto",
                padding: 16,
                display: "grid",
                gap: 14,
                alignContent: "start",
              }}
            >
              <div>
                <h2 className="fp-section-title">Filtrer l'assolement</h2>
                <p className="fp-hint" style={{ marginTop: 6 }}>
                  Choisissez une année puis les cultures à afficher. La carte se met à jour
                  immédiatement.
                </p>
              </div>

              <label style={{ display: "grid", gap: 5, fontSize: "var(--fs-md)", fontWeight: 600 }}>
                Année
                <select
                  value={viewerYearFilter}
                  onChange={(event) => setViewerYearFilter(event.target.value)}
                  style={{
                    padding: "7px 9px",
                    borderRadius: "var(--r-md)",
                    border: "1px solid var(--c-border-strong)",
                    background: "var(--c-surface)",
                    fontFamily: "inherit",
                    fontSize: "var(--fs-md)",
                    fontWeight: 400,
                  }}
                >
                  <option value="all">Toutes les années</option>
                  {yearOptions.years.map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  ))}
                  {yearOptions.hasUnknown ? (
                    <option value={UNKNOWN_YEAR}>Année inconnue</option>
                  ) : null}
                </select>
              </label>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "var(--fs-md)", fontWeight: 600 }}>Cultures</span>
                  <button
                    type="button"
                    className="fp-btn fp-btn--sm"
                    style={{ marginLeft: "auto" }}
                    onClick={() => setViewerCultures(cultureOptions)}
                  >
                    Tout
                  </button>
                  <button
                    type="button"
                    className="fp-btn fp-btn--sm"
                    onClick={() => setViewerCultures([])}
                  >
                    Aucune
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 6,
                    maxHeight: 320,
                    overflowY: "auto",
                    marginTop: 10,
                    paddingRight: 2,
                  }}
                >
                  {cultureOptions.length === 0 ? (
                    <p className="fp-hint">
                      {parcelCount === 0
                        ? "Aucun parcellaire chargé. Passez en mode Édition pour en importer un."
                        : "Aucune culture renseignée pour cette année."}
                    </p>
                  ) : (
                    cultureOptions.map((culture) => (
                      <label
                        key={culture}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: "var(--fs-md)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={viewerCultures.includes(culture)}
                          onChange={() => toggleCulture(culture)}
                        />
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: legendPalette[culture] || "#60a5fa",
                            border: "1px solid rgba(15,23,42,0.18)",
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ lineHeight: 1.3 }}>{culture}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </aside>

            <div style={{ position: "relative", minWidth: 0 }}>
              <ParcellesViewerMap
                data={parcellesCollection}
                isActive
                filters={viewerFilters}
                colorBy="culture"
                palette={legendPalette}
              />
            </div>
          </div>
        </>
      ) : (
        <Suspense
          fallback={
            <div style={{ padding: 24, color: "var(--c-text-soft)" }}>
              Chargement de l'éditeur…
            </div>
          }
        >
          <ParcellesEditorMap
            mapMode={mapMode}
            onMapModeChange={setMapMode}
            onOpenGuide={() => setGuideOpen(true)}
          />
        </Suspense>
      )}

      <GuideModal open={guideOpen} onClose={closeGuide} />
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
