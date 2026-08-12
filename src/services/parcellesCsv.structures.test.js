import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

// Le référentiel est mémorisé dans un module : chaque cas repart d'un module
// neuf, sinon le premier chargement réussi servirait à tous les suivants.
let loadAssoliaStructureNames;

beforeEach(async () => {
  vi.resetModules();
  ({ loadAssoliaStructureNames } = await import("./parcellesCsv.js"));
});

// Le référentiel réel du dépôt : c'est lui qui fait la correspondance entre les
// noms de culture Assolia et les codes Télépac à trois lettres, et c'est de lui
// que vient la liste des structures proposée à l'export CSV.
const REFERENTIEL = readFileSync("data/assolia_cultures_export.csv", "utf8");

/** Simule le serveur : répond sur les URL fournies, 404 sur les autres. */
function stubFetch(reponses) {
  const urls = [];
  vi.stubGlobal("fetch", async (url) => {
    const key = String(url);
    urls.push(key);
    const corps = reponses[key];
    if (corps == null) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => corps };
  });
  return urls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadAssoliaStructureNames", () => {
  it("liste les structures du référentiel Assolia", async () => {
    stubFetch({ "/data/assolia_cultures_export.csv": REFERENTIEL });
    const noms = await loadAssoliaStructureNames();
    expect(noms.length).toBeGreaterThan(20);
    expect(noms).toContain("Arterris");
    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr")));
  });

  it("ne renvoie aucun doublon", async () => {
    stubFetch({ "/data/assolia_cultures_export.csv": REFERENTIEL });
    const noms = await loadAssoliaStructureNames();
    expect(new Set(noms).size).toBe(noms.length);
  });

  it("retombe sur la copie versionnée quand la couche publique manque", async () => {
    // Poste neuf : `public/data` est vide, le serveur sert `data/`.
    const urls = stubFetch({ "data/assolia_cultures_export.csv": REFERENTIEL });
    const noms = await loadAssoliaStructureNames();
    expect(noms.length).toBeGreaterThan(20);
    expect(urls.length).toBeGreaterThan(1);
  });

  it("refuse une page HTML servie à la place du CSV", async () => {
    // Une route inconnue retombant sur index.html s'analysait sans erreur et
    // rendait une liste vide, sans que rien ne l'explique.
    stubFetch({ "/data/assolia_cultures_export.csv": "<!doctype html><html><body>app</body></html>" });
    await expect(loadAssoliaStructureNames()).rejects.toThrow(/référentiel/i);
  });

  it("signale les emplacements essayés quand rien ne répond", async () => {
    stubFetch({});
    await expect(loadAssoliaStructureNames()).rejects.toThrow(/assolia_cultures_export\.csv/);
  });
});
