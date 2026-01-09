import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
    res.setHeader("Access-Control-Allow-Methods", "GET,PUT,OPTIONS");
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
