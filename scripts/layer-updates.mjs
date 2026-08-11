// Détection des mises à jour de couches cartographiques.
//
// Les couches vivent dans les Releases GitHub. Sans vérification, une carte
// corrigée ne redescendrait jamais sur les postes : le fichier déjà présent
// localement serait servi indéfiniment. Ce module interroge les releases et
// compare trois états :
//
//   - ce que le manifeste embarqué décrit  (data-layers.json)
//   - ce qui est réellement publié          (API GitHub)
//   - ce qui est présent sur le poste       (public/data)
//
// L'appel est silencieux en cas de coupure réseau : l'application doit rester
// utilisable hors ligne.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { DATASETS, PUBLIC_DATA_DIR, REPO } from "./layers-config.mjs";
import { loadManifest } from "./layer-store.mjs";

const CACHE_PATH = path.resolve(process.cwd(), "data", "layer-update-check.json");
// L'API GitHub non authentifiée autorise 60 requêtes par heure : une
// vérification quotidienne (4 requêtes) laisse une marge confortable.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

const log = (type, payload) => console.info(`[${type}]`, JSON.stringify(payload));

async function fetchReleaseAssets(tag) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload?.assets) ? payload.assets : [];
  } finally {
    clearTimeout(timer);
  }
}

const localPathOf = (directory, name) =>
  path.join(PUBLIC_DATA_DIR, directory === "." ? "" : directory, name);

async function localSize(directory, name) {
  try {
    const info = await stat(localPathOf(directory, name));
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

/**
 * Compare l'état publié à l'état local.
 *
 * @returns {Promise<object>} rapport : couches à mettre à jour, nouveautés,
 *   et indication d'une éventuelle indisponibilité du réseau.
 */
export async function checkLayerUpdates() {
  const manifest = await loadManifest();
  const manifestByKey = new Map(
    manifest.map((layer) => [`${layer.dataset}/${layer.name}`, layer])
  );

  const outdated = [];
  const added = [];
  let unreachable = 0;

  for (const dataset of DATASETS) {
    let assets;
    try {
      assets = await fetchReleaseAssets(dataset.tag);
    } catch {
      // Hors ligne, release absente ou quota atteint : on ne signale rien pour
      // ce jeu de données plutôt que d'inventer une alerte.
      unreachable += 1;
      continue;
    }

    for (const asset of assets) {
      const key = `${dataset.id}/${asset.name}`;
      const known = manifestByKey.get(key);

      if (!known) {
        added.push({ dataset: dataset.id, name: asset.name, size: asset.size });
        continue;
      }

      // Une couche absente du poste sera de toute façon téléchargée à jour au
      // premier usage : inutile de la signaler.
      const presentSize = await localSize(known.directory, asset.name);
      if (presentSize == null) continue;

      const republished = known.updatedAt && asset.updated_at && asset.updated_at !== known.updatedAt;
      const sizeChanged = presentSize !== asset.size;
      if (republished || sizeChanged) {
        outdated.push({
          dataset: dataset.id,
          directory: known.directory,
          name: asset.name,
          size: asset.size,
          publishedAt: asset.updated_at ?? null,
        });
      }
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    outdated,
    added,
    // Vrai lorsqu'aucune release n'a pu être interrogée : l'état est inconnu,
    // pas « à jour ».
    offline: unreachable === DATASETS.length,
  };
}

async function readCache() {
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf-8"));
  } catch {
    return null;
  }
}

async function writeCache(report) {
  try {
    await mkdir(path.dirname(CACHE_PATH), { recursive: true });
    await writeFile(CACHE_PATH, `${JSON.stringify(report, null, 2)}\n`);
  } catch {
    // Cache indisponible : la vérification sera simplement refaite.
  }
}

/** Rapport du cache s'il est récent, sinon vérification fraîche. */
export async function getLayerUpdateReport({ force = false } = {}) {
  if (!force) {
    const cached = await readCache();
    if (cached?.checkedAt && Date.now() - Date.parse(cached.checkedAt) < CACHE_TTL_MS) {
      return { ...cached, fromCache: true };
    }
  }

  const report = await checkLayerUpdates();
  await writeCache(report);
  if (report.outdated.length || report.added.length) {
    log("LAYER_UPDATES_AVAILABLE", {
      aMettreAJour: report.outdated.length,
      nouvelles: report.added.length,
    });
  }
  return { ...report, fromCache: false };
}

/**
 * Supprime les copies locales périmées : la couche sera retéléchargée, à jour,
 * au prochain affichage. On ne retélécharge pas immédiatement pour ne pas
 * imposer plusieurs centaines de mégaoctets à l'ouverture de l'application.
 */
export async function applyLayerUpdates(report) {
  const { rm } = await import("node:fs/promises");
  const removed = [];
  for (const layer of report?.outdated || []) {
    try {
      await rm(localPathOf(layer.directory, layer.name), { force: true });
      removed.push(layer.name);
    } catch {
      // Fichier verrouillé ou déjà absent : on passe au suivant.
    }
  }
  if (removed.length) log("LAYER_UPDATES_APPLIED", { supprimees: removed.length });

  // Le cache doit refléter l'action immédiatement : sans cela, l'interface
  // relirait le rapport précédent et continuerait d'afficher l'alerte pendant
  // 24 h. Une couche écartée n'est plus « périmée », elle est simplement
  // absente et sera reprise à jour au prochain affichage.
  const remaining = (report?.outdated || []).filter((layer) => !removed.includes(layer.name));
  await writeCache({ ...report, outdated: remaining, checkedAt: new Date().toISOString() });

  return removed;
}

/** Vérification d'arrière-plan au démarrage, sans jamais bloquer le serveur. */
export function scheduleStartupCheck() {
  setTimeout(() => {
    getLayerUpdateReport().catch(() => {
      // Silencieux : l'application doit démarrer même sans réseau.
    });
  }, 2000).unref?.();
}
