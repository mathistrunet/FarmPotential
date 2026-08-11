// Publie les couches cartographiques locales dans les Releases GitHub.
//
// Ces fichiers pèsent plusieurs gigaoctets : les versionner rendait le dépôt
// inutilisable (quota Git LFS, clones interminables). Ils vivent désormais dans
// des releases, et l'application les télécharge à la demande, une seule fois par
// poste (voir scripts/layer-store.mjs).
//
//   node scripts/publish-layers.mjs              # publie ce qui manque
//   node scripts/publish-layers.mjs --dry-run    # montre ce qui serait envoyé
//   node scripts/publish-layers.mjs --dataset soilmap
//
// Le script est idempotent : un fichier déjà présent dans la release est ignoré.
// Il régénère ensuite le manifeste data-layers.json, qui est versionné.

import { execFile } from "node:child_process";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import proj4 from "proj4";

import { DATASETS, MANIFEST_PATH, PUBLIC_DATA_DIR, REPO } from "./layers-config.mjs";

// Stereo 70 roumain, absent du catalogue proj4 par défaut. Définition alignée
// sur scripts/rpg-romania-query.mjs, décalage de datum Krassowsky inclus.
proj4.defs(
  "EPSG:3844",
  "+proj=sterea +lat_0=46 +lon_0=25 +k=0.99975 +x_0=500000 +y_0=500000 " +
    "+ellps=krass +towgs84=2.329,-147.042,-92.08,-0.309,0.325,0.497,5.69 +units=m +no_defs"
);

const run = promisify(execFile);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyDataset = args.includes("--dataset")
  ? args[args.indexOf("--dataset") + 1]
  : null;

const log = (message) => console.log(message);

/**
 * Emprise WGS84 déclarée par le GeoPackage, pour ne télécharger que l'utile.
 *
 * Les fichiers ne sont pas tous en degrés : le parcellaire roumain est en
 * Stereo 70 et la toponymie en Lambert-93. On reprojette donc les quatre coins,
 * en suivant la même détection que le lecteur de couches roumaines — le SRS
 * déclaré dans ces fichiers étant trompeur, c'est la définition WKT qui fait foi.
 */
function readGeoPackageBbox(filePath) {
  let db;
  try {
    db = new DatabaseSync(filePath, { readOnly: true });
    const row = db
      .prepare(
        "SELECT min_x, min_y, max_x, max_y, srs_id FROM gpkg_contents WHERE min_x IS NOT NULL LIMIT 1"
      )
      .get();
    if (!row) return null;

    const values = [row.min_x, row.min_y, row.max_x, row.max_y].map(Number);
    if (!values.every(Number.isFinite)) return null;
    const [minX, minY, maxX, maxY] = values;

    const srs = row.srs_id == null ? null : Number(row.srs_id);
    if (srs === 4326 || (Math.abs(minX) <= 180 && Math.abs(maxX) <= 180 && Math.abs(minY) <= 90 && Math.abs(maxY) <= 90)) {
      return values;
    }

    const definition =
      db.prepare("SELECT definition FROM gpkg_spatial_ref_sys WHERE srs_id = ?").get(srs)
        ?.definition ?? null;
    const looksStereo70 =
      typeof definition === "string" && /Oblique_Stereographic|Stereo\s*70/i.test(definition);
    const source = looksStereo70 ? "EPSG:3844" : definition || null;
    if (!source) return null;

    const corners = [
      [minX, minY],
      [minX, maxY],
      [maxX, minY],
      [maxX, maxY],
    ].map((corner) => proj4(source, "EPSG:4326", corner));
    const lons = corners.map(([lon]) => lon);
    const lats = corners.map(([, lat]) => lat);
    const bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    return bbox.every(Number.isFinite) ? bbox : null;
  } catch {
    // Emprise illisible : la couche sera simplement toujours téléchargée.
    return null;
  } finally {
    db?.close?.();
  }
}

async function listDatasetFiles(dataset) {
  const directory = path.join(PUBLIC_DATA_DIR, dataset.directory);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    log(`  ! dossier absent : ${directory}`);
    return [];
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!dataset.extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) continue;
    const filePath = path.join(directory, entry.name);
    const { size } = await stat(filePath);
    files.push({
      name: entry.name,
      filePath,
      size,
      bbox: entry.name.toLowerCase().endsWith(".gpkg") ? readGeoPackageBbox(filePath) : null,
    });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

async function gh(argv) {
  const { stdout } = await run("gh", argv, { maxBuffer: 32 * 1024 * 1024 });
  return stdout.trim();
}

/** Crée la release si besoin et renvoie la liste des fichiers déjà présents. */
async function ensureRelease(dataset) {
  try {
    const raw = await gh([
      "release", "view", dataset.tag, "--repo", REPO, "--json", "assets",
    ]);
    const { assets = [] } = JSON.parse(raw);
    return new Set(assets.map((asset) => asset.name));
  } catch {
    log(`  → création de la release ${dataset.tag}`);
    if (!dryRun) {
      await gh([
        "release", "create", dataset.tag,
        "--repo", REPO,
        "--title", dataset.title,
        "--notes", dataset.notes,
      ]);
    }
    return new Set();
  }
}

const formatMo = (bytes) => `${(bytes / 1048576).toFixed(1)} Mo`;

async function publishDataset(dataset) {
  log("");
  log(`== ${dataset.title} (${dataset.tag})`);
  const files = await listDatasetFiles(dataset);
  if (!files.length) return [];

  const total = files.reduce((sum, file) => sum + file.size, 0);
  log(`   ${files.length} fichier(s), ${formatMo(total)}`);

  const existing = await ensureRelease(dataset);
  const missing = files.filter((file) => !existing.has(file.name));

  if (!missing.length) {
    log("   déjà publié intégralement");
  } else {
    const missingSize = missing.reduce((sum, file) => sum + file.size, 0);
    log(`   ${missing.length} à envoyer (${formatMo(missingSize)})`);

    // Envoi par lots : un appel unique sur 95 fichiers est fragile, et un lot
    // qui échoue peut être relancé sans tout recommencer.
    const BATCH = 8;
    for (let index = 0; index < missing.length; index += BATCH) {
      const batch = missing.slice(index, index + BATCH);
      log(`   [${index + 1}-${index + batch.length}/${missing.length}] ${batch.map((f) => f.name).join(", ")}`);
      if (dryRun) continue;
      await gh([
        "release", "upload", dataset.tag,
        ...batch.map((file) => file.filePath),
        "--repo", REPO, "--clobber",
      ]);
    }
  }

  return files.map((file) => ({
    dataset: dataset.id,
    directory: dataset.directory,
    name: file.name,
    size: file.size,
    bbox: file.bbox,
    url: `https://github.com/${REPO}/releases/download/${dataset.tag}/${encodeURIComponent(file.name)}`,
  }));
}

async function main() {
  const datasets = onlyDataset
    ? DATASETS.filter((dataset) => dataset.id === onlyDataset)
    : DATASETS;
  if (!datasets.length) {
    console.error(`Jeu de données inconnu : ${onlyDataset}`);
    process.exit(1);
  }

  log(`Dépôt : ${REPO}${dryRun ? "   (simulation)" : ""}`);

  const layers = [];
  for (const dataset of datasets) {
    layers.push(...(await publishDataset(dataset)));
  }

  // En publication partielle, on conserve les entrées des autres jeux de données.
  let previous = [];
  if (onlyDataset) {
    try {
      const { readFile } = await import("node:fs/promises");
      const existing = JSON.parse(await readFile(MANIFEST_PATH, "utf-8"));
      previous = (existing.layers || []).filter((layer) => layer.dataset !== onlyDataset);
    } catch {
      previous = [];
    }
  }

  const manifest = {
    repo: REPO,
    generatedFrom: "scripts/publish-layers.mjs",
    layers: [...previous, ...layers].sort(
      (a, b) => a.dataset.localeCompare(b.dataset) || a.name.localeCompare(b.name)
    ),
  };

  log("");
  if (dryRun) {
    log(`Simulation : ${manifest.layers.length} entrées, manifeste non écrit.`);
    return;
  }
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  log(`Manifeste écrit : ${path.relative(process.cwd(), MANIFEST_PATH)} (${manifest.layers.length} couches)`);
}

main().catch((error) => {
  console.error("");
  console.error("Échec de la publication :", error?.stderr || error?.message || error);
  process.exit(1);
});
