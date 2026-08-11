// Récupération des couches cartographiques à la demande.
//
// Les couches ne sont plus versionnées : elles vivent dans les Releases GitHub
// (voir scripts/publish-layers.mjs) et sont téléchargées au premier usage, puis
// conservées dans public/data. Une installation neuve pèse donc quelques
// mégaoctets et ne récupère que les secteurs réellement consultés.

import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { MANIFEST_PATH, PUBLIC_DATA_DIR } from "./layers-config.mjs";

const log = (type, payload) => console.info(`[${type}]`, JSON.stringify(payload));

let manifestPromise = null;

/** Manifeste des couches publiées (chargé une fois, puis mémorisé). */
export async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = readFile(MANIFEST_PATH, "utf-8")
      .then((raw) => {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.layers) ? parsed.layers : [];
      })
      .catch(() => {
        // Pas de manifeste : l'application fonctionne avec les fichiers déjà
        // présents sur le poste, sans téléchargement.
        return [];
      });
  }
  return manifestPromise;
}

const layerLocalPath = (layer) =>
  path.join(PUBLIC_DATA_DIR, layer.directory === "." ? "" : layer.directory, layer.name);

async function fileExists(filePath, expectedSize) {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    // Une taille différente trahit un téléchargement interrompu.
    return expectedSize == null || info.size === expectedSize;
  } catch {
    return false;
  }
}

// Un même fichier peut être réclamé par plusieurs requêtes simultanées : on
// partage le téléchargement en cours plutôt que d'en lancer plusieurs.
const inflight = new Map();

async function download(layer, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part`;

  const response = await fetch(layer.url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} sur ${layer.url}`);
  }

  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    // Renommage final : un fichier partiel ne doit jamais être vu comme valide.
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/**
 * Garantit la présence locale d'une couche, en la téléchargeant si nécessaire.
 *
 * @returns {Promise<string|null>} chemin local, ou null si la couche est
 *   inconnue du manifeste et absente du disque.
 */
export async function ensureLayer(directory, name) {
  const layers = await loadManifest();
  const layer = layers.find((item) => item.directory === directory && item.name === name);

  // Hors manifeste : on se contente de ce qui est sur le disque (installation
  // complète à l'ancienne, ou couche ajoutée à la main).
  if (!layer) {
    const fallback = path.join(PUBLIC_DATA_DIR, directory === "." ? "" : directory, name);
    return (await fileExists(fallback)) ? fallback : null;
  }

  const destination = layerLocalPath(layer);
  if (await fileExists(destination, layer.size)) return destination;

  if (!inflight.has(destination)) {
    const started = Date.now();
    log("LAYER_DOWNLOAD_START", { name: layer.name, mo: +(layer.size / 1048576).toFixed(1) });
    const promise = download(layer, destination)
      .then(() => {
        log("LAYER_DOWNLOAD_DONE", { name: layer.name, seconds: Math.round((Date.now() - started) / 1000) });
        return destination;
      })
      .catch((error) => {
        log("LAYER_DOWNLOAD_FAILED", { name: layer.name, message: error?.message || String(error) });
        throw error;
      })
      .finally(() => inflight.delete(destination));
    inflight.set(destination, promise);
  }

  return inflight.get(destination);
}

/** true si deux emprises WGS84 [ouest, sud, est, nord] se recouvrent. */
export const bboxIntersects = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/**
 * Prépare les couches d'un jeu de données couvrant l'emprise demandée.
 *
 * Sert au parcellaire roumain, dont le backend balaie tout le dossier : sans ce
 * filtrage, la première utilisation téléchargerait les 2,3 Go de toutes les
 * régions au lieu des seules régions visibles.
 */
export async function ensureDatasetForBbox(datasetId, bbox) {
  const layers = await loadManifest();
  const candidates = layers.filter(
    (layer) => layer.dataset === datasetId && (!layer.bbox || bboxIntersects(layer.bbox, bbox))
  );

  const results = await Promise.allSettled(
    candidates.map((layer) => ensureLayer(layer.directory, layer.name))
  );
  const failed = results.filter((result) => result.status === "rejected").length;
  if (failed) {
    log("LAYER_DATASET_PARTIAL", { dataset: datasetId, manquantes: failed });
  }
  return candidates.length - failed;
}
