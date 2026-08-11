// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";

const LEGACY_KEY = "parcelles.geojson";
const CURRENT_KEY = "studioparcellaire.parcelles-temp";
// Marqueur de version : sans lui, le module purge le brouillon local au premier
// chargement (cette version démarre sans parcellaire enregistré).
const VERSION_KEY = "studioparcellaire.parcelles-version";
const VERSION = "2";

const SAMPLE_COLLECTION = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { nom: "P1" },
      geometry: {
        type: "Polygon",
        coordinates: [[[1, 44], [2, 44], [2, 45], [1, 44]]],
      },
    },
  ],
});

// La purge et la migration s'exécutent au chargement du module : chaque test
// prépare donc localStorage avant de ré-importer.
describe("parcellesBackend — purge de première installation", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("efface le brouillon local hérité et pose le marqueur de version", async () => {
    window.localStorage.setItem(CURRENT_KEY, SAMPLE_COLLECTION);
    window.localStorage.setItem(LEGACY_KEY, SAMPLE_COLLECTION);
    await import("./parcellesBackend");
    expect(window.localStorage.getItem(CURRENT_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(window.localStorage.getItem(VERSION_KEY)).toBe(VERSION);
  });

  it("ne purge plus une fois le marqueur posé", async () => {
    window.localStorage.setItem(VERSION_KEY, VERSION);
    window.localStorage.setItem(CURRENT_KEY, SAMPLE_COLLECTION);
    await import("./parcellesBackend");
    expect(window.localStorage.getItem(CURRENT_KEY)).toBe(SAMPLE_COLLECTION);
  });
});

describe("parcellesBackend — migration localStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Installation déjà initialisée : la purge de première ouverture n'entre pas en jeu.
    window.localStorage.setItem(VERSION_KEY, VERSION);
    vi.resetModules();
  });

  it("migration : copie la clé legacy vers la nouvelle clé et supprime l'ancienne", async () => {
    window.localStorage.setItem(LEGACY_KEY, SAMPLE_COLLECTION);
    await import("./parcellesBackend");
    expect(window.localStorage.getItem(CURRENT_KEY)).toBe(SAMPLE_COLLECTION);
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("migration : ne touche rien si la nouvelle clé existe déjà", async () => {
    const existingData = JSON.stringify({ type: "FeatureCollection", features: [] });
    window.localStorage.setItem(CURRENT_KEY, existingData);
    window.localStorage.setItem(LEGACY_KEY, SAMPLE_COLLECTION);
    await import("./parcellesBackend");
    // La nouvelle clé reste intacte, l'ancienne n'est pas supprimée car la migration skip
    expect(window.localStorage.getItem(CURRENT_KEY)).toBe(existingData);
  });

  it("migration : ne fait rien si aucune des deux clés n'existe", async () => {
    await import("./parcellesBackend");
    expect(window.localStorage.getItem(CURRENT_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("fetchParcellesGeojson : lit depuis la clé unifiée", async () => {
    window.localStorage.setItem(CURRENT_KEY, SAMPLE_COLLECTION);
    const { fetchParcellesGeojson } = await import("./parcellesBackend");
    const result = await fetchParcellesGeojson();
    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.nom).toBe("P1");
  });

  it("fetchParcellesGeojson : retourne les données de l'API quand localStorage est vide", async () => {
    const emptyCollection = { type: "FeatureCollection", features: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(emptyCollection),
    }));
    const { fetchParcellesGeojson } = await import("./parcellesBackend");
    const result = await fetchParcellesGeojson();
    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("fetchParcellesGeojson : lève une erreur si API et localStorage sont tous deux indisponibles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("réseau indisponible")));
    const { fetchParcellesGeojson } = await import("./parcellesBackend");
    await expect(fetchParcellesGeojson()).rejects.toThrow("PARCELLES_FETCH_FAILED");
    vi.unstubAllGlobals();
  });

  it("fetchParcellesGeojson : retombe sur localStorage si l'API échoue", async () => {
    window.localStorage.setItem(CURRENT_KEY, SAMPLE_COLLECTION);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("réseau indisponible")));
    const { fetchParcellesGeojson } = await import("./parcellesBackend");
    const result = await fetchParcellesGeojson();
    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
