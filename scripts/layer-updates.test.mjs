import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// layers-config.mjs résout ses chemins sur process.cwd() au chargement : on
// place donc le répertoire de travail sur un bac à sable AVANT d'importer les
// modules testés.
let sandbox;
const realCwd = process.cwd();

const MANIFEST = {
  repo: "exemple/depot",
  layers: [
    {
      dataset: "soilmap",
      directory: "soilmap_dep",
      name: "code_insee_31.gpkg",
      size: 100,
      updatedAt: "2026-01-01T00:00:00Z",
      url: "https://exemple/31",
    },
    {
      dataset: "referentiels",
      directory: ".",
      name: "cultures.csv",
      size: 50,
      updatedAt: "2026-01-01T00:00:00Z",
      url: "https://exemple/cultures",
    },
  ],
};

/** Réponse d'API simulée : assets indexés par tag de release. */
const releases = (overrides = {}) =>
  new Map([
    [
      "layers-soilmap-v1",
      [{ name: "code_insee_31.gpkg", size: 100, updated_at: "2026-01-01T00:00:00Z", ...overrides.soilmap }],
    ],
    [
      "layers-referentiels-v1",
      [{ name: "cultures.csv", size: 50, updated_at: "2026-01-01T00:00:00Z", ...overrides.referentiels }],
    ],
  ]);

let checkLayerUpdates;
let applyLayerUpdates;
let recordLayerVersion;

async function writeLocalLayer(relative, size) {
  const full = path.join(sandbox, "public", "data", relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, "x".repeat(size));
}

beforeEach(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "fp-layers-"));
  process.chdir(sandbox);
  await mkdir(path.join(sandbox, "data"), { recursive: true });
  await writeFile(path.join(sandbox, "data-layers.json"), JSON.stringify(MANIFEST));

  // Modules réévalués à chaque test : leurs chemins et leur cache de manifeste
  // sont figés au chargement, à partir du répertoire de travail courant.
  vi.resetModules();
  ({ checkLayerUpdates, applyLayerUpdates } = await import("./layer-updates.mjs"));
  ({ recordLayerVersion } = await import("./layer-store.mjs"));
});

afterEach(async () => {
  process.chdir(realCwd);
  await rm(sandbox, { recursive: true, force: true });
});

describe("checkLayerUpdates", () => {
  it("ne signale rien quand tout concorde", async () => {
    await writeLocalLayer("soilmap_dep/code_insee_31.gpkg", 100);
    await writeLocalLayer("cultures.csv", 50);

    const report = await checkLayerUpdates({ fetchReleases: async () => releases() });
    expect(report.outdated).toEqual([]);
    expect(report.added).toEqual([]);
    expect(report.offline).toBe(false);
  });

  it("signale une couche republiée depuis son téléchargement", async () => {
    await writeLocalLayer("cultures.csv", 50);
    const report = await checkLayerUpdates({
      fetchReleases: async () => releases({ referentiels: { updated_at: "2026-06-01T00:00:00Z" } }),
    });
    expect(report.outdated.map((layer) => layer.name)).toEqual(["cultures.csv"]);
    expect(report.outdated[0].publishedAt).toBe("2026-06-01T00:00:00Z");
  });

  it("signale une taille différente même à date inchangée", async () => {
    await writeLocalLayer("cultures.csv", 7);
    const report = await checkLayerUpdates({ fetchReleases: async () => releases() });
    expect(report.outdated.map((layer) => layer.name)).toEqual(["cultures.csv"]);
  });

  it("ignore une couche absente du poste : elle arrivera à jour au premier usage", async () => {
    const report = await checkLayerUpdates({
      fetchReleases: async () => releases({ referentiels: { updated_at: "2026-06-01T00:00:00Z" } }),
    });
    expect(report.outdated).toEqual([]);
  });

  it("annonce les couches nouvellement publiées", async () => {
    const withExtra = releases();
    withExtra.set("layers-soilmap-v1", [
      ...withExtra.get("layers-soilmap-v1"),
      { name: "code_insee_32.gpkg", size: 200, updated_at: "2026-06-01T00:00:00Z" },
    ]);
    const report = await checkLayerUpdates({ fetchReleases: async () => withExtra });
    expect(report.added.map((layer) => layer.name)).toEqual(["code_insee_32.gpkg"]);
  });

  it("déclare l'état inconnu plutôt qu'« à jour » quand l'API est injoignable", async () => {
    await writeLocalLayer("cultures.csv", 50);
    const report = await checkLayerUpdates({
      fetchReleases: async () => {
        throw new Error("quota atteint");
      },
    });
    expect(report.offline).toBe(true);
    expect(report.outdated).toEqual([]);
  });

  it("fait primer la version détenue localement sur le manifeste livré", async () => {
    // Cas réel : le manifeste embarqué est figé à la version installée. Sans le
    // registre local, une couche déjà mise à jour resterait signalée sans fin.
    await writeLocalLayer("cultures.csv", 50);
    await recordLayerVersion(".", "cultures.csv", { size: 50, updatedAt: "2026-06-01T00:00:00Z" });

    const report = await checkLayerUpdates({
      fetchReleases: async () => releases({ referentiels: { updated_at: "2026-06-01T00:00:00Z" } }),
    });
    expect(report.outdated).toEqual([]);
  });
});

describe("applyLayerUpdates", () => {
  it("écarte la copie périmée et retient la version publiée", async () => {
    await writeLocalLayer("cultures.csv", 50);
    const fetchReleases = async () =>
      releases({ referentiels: { updated_at: "2026-06-01T00:00:00Z" } });

    const before = await checkLayerUpdates({ fetchReleases });
    expect(before.outdated).toHaveLength(1);

    const removed = await applyLayerUpdates(before);
    expect(removed).toEqual(["cultures.csv"]);

    // L'alerte ne doit pas réapparaître, y compris avant tout retéléchargement.
    const after = await checkLayerUpdates({ fetchReleases });
    expect(after.outdated).toEqual([]);
  });
});
