import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyCorrespondencesAndMerge,
  buildParcellesByYearFromFeatures,
} from "../src/domain/parcelles/fusion.js";
import {
  buildSoilGridsResponse,
  computeSoilIndicators,
  parseSoilGridsProperties,
} from "../src/services/soilgrids.js";
import { SoilGridsClient, SoilGridsError } from "./soilgrids/SoilGridsClient.mjs";
import { SoilGridsCacheRepository } from "./soilgrids/SoilGridsCacheRepository.mjs";
import { resolveParcelPoint } from "./soilgrids/geometry.mjs";
import { closeGeoPackageCache, queryGeoPackageByBbox } from "./geopackage-query.mjs";

const PORT = Number(process.env.PORT || 4174);
const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "parcelles.geojson");
const SOIL_MAPPING_FILE = path.join(DATA_DIR, "soil-type-mappings.json");
const PUBLIC_DATA_DIR = path.resolve(process.cwd(), "public", "data");
const SOILMAP_DEP_DIR = path.join(PUBLIC_DATA_DIR, "soilmap_dep");
const TOPONYMIE_DIR = path.join(PUBLIC_DATA_DIR, "TOPONYMIE");
const POINT_STRATEGY = process.env.SOILGRIDS_POINT_STRATEGY || "centroid";
const CALC_VERSION = "v1.0.0";

const soilClient = new SoilGridsClient({ timeoutMs: 15_000, retries: 2 });
const soilCacheRepository = new SoilGridsCacheRepository({ dataDir: DATA_DIR, ttlDays: 30 });
const inflightSoilRequests = new Map();
const rateLimitWindow = [];

const emptyCollection = () => ({ type: "FeatureCollection", features: [] });
const log = (type, payload) => console.info(`[${type}]`, JSON.stringify(payload));

const TOPONYMIE_FILES = {
  ARA: "TOPONYMIE_ARA.gpkg",
  BFC: "TOPONYMIE_BFC.gpkg",
  BRATAGNE: "TOPONYMIE_Bratagne.gpkg",
  CENTRE: "TOPONYMIE_Centre.gpkg",
  GEST: "TOPONYMIE_GEst.gpkg",
  HDF: "TOPONYMIE_HDF.gpkg",
  IDF: "TOPONYMIE_IDF.gpkg",
  NAQUITAINE: "TOPONYMIE_NAquitaine.gpkg",
  NORMANDIE: "TOPONYMIE_Normandie.gpkg",
  OCCITANIE: "TOPONYMIE_Occitanie.gpkg",
  PACA: "TOPONYMIE_PACA.gpkg",
  PDL: "TOPONYMIE_PDL.gpkg",
};

async function ensureDataFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(DATA_FILE, "utf-8");
  } catch {
    await writeFile(DATA_FILE, JSON.stringify(emptyCollection(), null, 2));
  }
}

async function ensureSoilMappingFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(SOIL_MAPPING_FILE, "utf-8");
  } catch {
    await writeFile(SOIL_MAPPING_FILE, JSON.stringify({ mappings: {} }, null, 2));
  }
}

async function readSoilMappings() {
  await ensureSoilMappingFile();
  const raw = await readFile(SOIL_MAPPING_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.mappings && typeof parsed.mappings === "object") {
      return parsed;
    }
  } catch {
    // ignore
  }
  return { mappings: {} };
}

async function writeSoilMappings(payload) {
  await ensureSoilMappingFile();
  const mappings = payload && typeof payload.mappings === "object" ? payload.mappings : {};
  await writeFile(SOIL_MAPPING_FILE, JSON.stringify({ mappings }, null, 2));
}

async function readCollection() {
  await ensureDataFile();
  const raw = await readFile(DATA_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.type === "FeatureCollection") return parsed;
  } catch {
    // ignore
  }
  return emptyCollection();
}

async function writeCollection(collection) {
  await ensureDataFile();
  await writeFile(DATA_FILE, JSON.stringify(collection, null, 2));
}

const parseUrl = (requestUrl) => new URL(requestUrl, "http://localhost");

const rateLimited = () => {
  const now = Date.now();
  while (rateLimitWindow.length && now - rateLimitWindow[0] > 60_000) rateLimitWindow.shift();
  if (rateLimitWindow.length >= 60) return true;
  rateLimitWindow.push(now);
  return false;
};

const round4 = (value) => Number(value).toFixed(4);

function parseBboxParam(raw) {
  if (!raw) return null;
  const values = String(raw)
    .split(",")
    .map((part) => Number(part.trim()));
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const [minX, minY, maxX, maxY] = values;
  if (minX >= maxX || minY >= maxY) return null;
  return [minX, minY, maxX, maxY];
}

function parseIntegerParam(raw, fallback, min = 1, max = 20_000) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

async function loadSoilGridsForParcel({ parcelId, refresh, depthProfile }) {
  const collection = await readCollection();
  const feature = (collection.features || []).find(
    (item) => String(item?.id ?? item?.properties?.id ?? item?.properties?.parcelleNo) === String(parcelId)
  );
  if (!feature) throw new Error("[PARCEL_NOT_FOUND] Parcelle introuvable.");

  const pointInfo = resolveParcelPoint(feature, POINT_STRATEGY);
  const fetchedAt = new Date().toISOString();
  const cacheKey = `${round4(pointInfo.lat)}:${round4(pointInfo.lon)}:${(depthProfile || []).join("|")}`;

  if (!refresh) {
    const parcelCache = await soilCacheRepository.getByParcel(String(parcelId));
    if (parcelCache) return { payload: parcelCache.normalized_json, cache: true };
    const shared = await soilCacheRepository.getByCacheKey(cacheKey);
    if (shared) return { payload: shared.normalized_json, cache: true };
  }

  const inflightKey = `${parcelId}:${cacheKey}`;
  if (inflightSoilRequests.has(inflightKey)) return inflightSoilRequests.get(inflightKey);

  const promise = (async () => {
    const { payload: raw, meta } = await soilClient.query({
      lat: pointInfo.lat,
      lon: pointInfo.lon,
      depths: depthProfile,
    });
    const profile = parseSoilGridsProperties(raw, { depths: depthProfile });
    const summary = computeSoilIndicators(profile);
    if (pointInfo.warning) summary.warnings.push(pointInfo.warning);

    const normalized = buildSoilGridsResponse({
      parcelId: String(parcelId),
      lat: pointInfo.lat,
      lon: pointInfo.lon,
      pointStrategy: pointInfo.pointStrategy,
      fetchedAt,
      calcVersion: CALC_VERSION,
      profile,
      summary,
    });

    feature.properties = feature.properties || {};
    feature.properties.soilgridsPoint = {
      lat: pointInfo.lat,
      lon: pointInfo.lon,
      strategy: pointInfo.pointStrategy,
      timestamp: fetchedAt,
    };
    await writeCollection(collection);

    await soilCacheRepository.upsert({
      parcel_id: String(parcelId),
      lat: pointInfo.lat,
      lon: pointInfo.lon,
      response_raw_json: raw,
      normalized_json: normalized,
      fetched_at: fetchedAt,
      source: "SoilGrids v2",
      cache_key: cacheKey,
      calc_version: CALC_VERSION,
    });

    log("SOILGRIDS_FETCH", { parcelId, ...meta, cacheKey });
    return { payload: normalized, cache: false };
  })();

  inflightSoilRequests.set(inflightKey, promise);
  try {
    return await promise;
  } finally {
    inflightSoilRequests.delete(inflightKey);
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) return void res.end();
  const requestUrl = parseUrl(req.url);

  if (requestUrl.pathname.startsWith("/api/parcels/") && requestUrl.pathname.endsWith("/soilgrids")) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    if (req.method !== "GET") return void res.writeHead(405).end(JSON.stringify({ error: "Method not allowed." }));
    if (rateLimited()) return void res.writeHead(429).end(JSON.stringify({ error: "Rate limit exceeded." }));

    const match = requestUrl.pathname.match(/^\/api\/parcels\/([^/]+)\/soilgrids$/);
    const parcelId = match?.[1];
    const refresh = requestUrl.searchParams.get("refresh") === "true";
    const depthProfile = requestUrl.searchParams.get("depth_profile")?.split(",").filter(Boolean) || undefined;

    try {
      const result = await loadSoilGridsForParcel({ parcelId, refresh, depthProfile });
      res.writeHead(200);
      res.end(JSON.stringify({ ...result.payload, cacheHit: result.cache }));
    } catch (error) {
      const statusCode = error instanceof SoilGridsError ? error.statusCode : 500;
      log("SOILGRIDS_ERROR", {
        parcelId,
        statusCode,
        code: error?.code,
        message: error?.message || String(error),
      });
      res.writeHead(statusCode);
      res.end(JSON.stringify({ error: error?.message || "SoilGrids unavailable." }));
    }
    return;
  }

  if (requestUrl.pathname === "/api/soil/department") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    if (req.method !== "GET") return void res.writeHead(405).end(JSON.stringify({ error: "Method not allowed." }));

    const code = String(requestUrl.searchParams.get("code") || "")
      .trim()
      .toUpperCase();
    const bbox = parseBboxParam(requestUrl.searchParams.get("bbox"));
    const limit = parseIntegerParam(requestUrl.searchParams.get("limit"), 7000, 1, 20000);

    if (!code || !bbox) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Missing or invalid code/bbox query parameters." }));
      return;
    }

    const filePath = path.join(SOILMAP_DEP_DIR, `code_insee_${code}.gpkg`);
    try {
      const collection = await queryGeoPackageByBbox({
        filePath,
        bbox,
        maxFeatures: limit,
      });
      res.writeHead(200);
      res.end(
        JSON.stringify({
          code,
          bounds: bbox,
          featureCount: collection.features.length,
          collection,
        })
      );
    } catch (error) {
      const message = error?.message || "Soil query failed.";
      res.writeHead(500);
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  if (requestUrl.pathname === "/api/toponymie/points") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    if (req.method !== "GET") return void res.writeHead(405).end(JSON.stringify({ error: "Method not allowed." }));

    const region = String(requestUrl.searchParams.get("region") || "")
      .trim()
      .toUpperCase();
    const bbox = parseBboxParam(requestUrl.searchParams.get("bbox"));
    const limit = parseIntegerParam(requestUrl.searchParams.get("limit"), 8000, 1, 25000);
    const fileName = TOPONYMIE_FILES[region];
    if (!fileName || !bbox) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Missing or invalid region/bbox query parameters." }));
      return;
    }

    const filePath = path.join(TOPONYMIE_DIR, fileName);
    try {
      const collection = await queryGeoPackageByBbox({
        filePath,
        bbox,
        maxFeatures: limit,
        geometryTypes: new Set(["Point"]),
      });
      const points = collection.features.map((feature) => ({
        coordinates: feature.geometry?.coordinates || null,
        properties: feature.properties || {},
      }));
      res.writeHead(200);
      res.end(
        JSON.stringify({
          region,
          bounds: bbox,
          pointCount: points.length,
          points,
        })
      );
    } catch (error) {
      const message = error?.message || "Toponymy query failed.";
      res.writeHead(500);
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  if (requestUrl.pathname.startsWith("/api/parcelles")) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    if (req.method === "GET") return void res.writeHead(200).end(JSON.stringify(await readCollection()));

    if (requestUrl.pathname.startsWith("/api/parcelles/matching/validate") && req.method === "POST") {
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
            if (oldId != null && newId != null) correspondancesValidated[String(oldId)] = String(newId);
          });

          const collection = await readCollection();
          const parcellesByYear = buildParcellesByYearFromFeatures(
            Array.isArray(collection?.features) ? collection.features : []
          );
          const { parcellesByYear: mergedParcellesByYear } = applyCorrespondencesAndMerge({
            parcellesByYear,
            oldYear,
            newYear,
            correspondancesValidated,
            dropOldYear: true,
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
            features: [...otherFeatures, ...(oldCollection.features || []), ...(newCollection.features || [])],
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

  if (requestUrl.pathname.startsWith("/api/soil-type-mappings")) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,PUT,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    if (req.method === "GET") return void res.writeHead(200).end(JSON.stringify(await readSoilMappings()));
    if (req.method === "PUT") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body);
          await writeSoilMappings(parsed);
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

process.on("exit", () => {
  closeGeoPackageCache();
});
