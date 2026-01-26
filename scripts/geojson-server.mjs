import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyCorrespondencesAndMerge,
  buildParcellesByYearFromFeatures,
} from "../src/domain/parcelles/fusion.js";

const PORT = Number(process.env.PORT || 4174);
const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "parcelles.geojson");

const emptyCollection = () => ({
  type: "FeatureCollection",
  features: [],
});

async function ensureDataFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(DATA_FILE, "utf-8");
  } catch {
    await writeFile(DATA_FILE, JSON.stringify(emptyCollection(), null, 2));
  }
}

async function readCollection() {
  await ensureDataFile();
  const raw = await readFile(DATA_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.type === "FeatureCollection") {
      return parsed;
    }
  } catch {
    // fall back to empty collection
  }
  return emptyCollection();
}

async function writeCollection(collection) {
  await ensureDataFile();
  await writeFile(DATA_FILE, JSON.stringify(collection, null, 2));
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end();
    return;
  }

  if (req.url.startsWith("/api/parcelles")) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET") {
      const collection = await readCollection();
      res.writeHead(200);
      res.end(JSON.stringify(collection));
      return;
    }

    if (req.url.startsWith("/api/parcelles/matching/validate")) {
      if (req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(body);
            const oldYear = Number(payload?.oldYear);
            const newYear = Number(payload?.newYear);
            if (!Number.isFinite(oldYear) || !Number.isFinite(newYear)) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: "Invalid year payload." }));
              return;
            }
            const matches = Array.isArray(payload?.matches) ? payload.matches : [];
            const correspondancesValidated = {};
            matches.forEach((match) => {
              const oldId = match?.oldId ?? match?.oldKey ?? match?.old;
              const newId = match?.newId ?? match?.newKey ?? match?.new;
              if (oldId != null && newId != null) {
                correspondancesValidated[String(oldId)] = String(newId);
              }
            });

            const collection = await readCollection();
            const parcellesByYear = buildParcellesByYearFromFeatures(
              Array.isArray(collection?.features) ? collection.features : []
            );
            const { parcellesByYear: mergedParcellesByYear } =
              applyCorrespondencesAndMerge({
                parcellesByYear,
                oldYear,
                newYear,
                correspondancesValidated,
              });

            const oldCollection = mergedParcellesByYear?.[oldYear] || emptyCollection();
            const newCollection = mergedParcellesByYear?.[newYear] || emptyCollection();
            const otherFeatures = (collection?.features || []).filter((feature) => {
              const year = Number(feature?.properties?.annee);
              if (!Number.isFinite(year)) return true;
              return year !== oldYear && year !== newYear;
            });
            const mergedCollection = {
              type: "FeatureCollection",
              features: [
                ...otherFeatures,
                ...(oldCollection.features || []),
                ...(newCollection.features || []),
              ],
            };

            await writeCollection(mergedCollection);
            res.writeHead(200);
            res.end(
              JSON.stringify({
                status: "ok",
                collection: mergedCollection,
                parcellesOldYear: oldCollection,
                parcellesNewYear: newCollection,
              })
            );
          } catch (error) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: error?.message || "Invalid JSON payload." }));
          }
        });
        return;
      }
    }

    if (req.method === "PUT") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body);
          if (!parsed || parsed.type !== "FeatureCollection") {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Invalid FeatureCollection payload." }));
            return;
          }
          await writeCollection(parsed);
          res.writeHead(200);
          res.end(JSON.stringify({ status: "ok" }));
        } catch (error) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: error?.message || "Invalid JSON payload." }));
        }
      });
      return;
    }

    res.writeHead(405);
    res.end(JSON.stringify({ error: "Method not allowed." }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`GeoJSON backend listening on http://localhost:${PORT}`);
});
