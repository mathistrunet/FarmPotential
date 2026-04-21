import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import proj4 from "proj4";
import { DOMParser } from "@xmldom/xmldom";

const DEFAULT_WCS_URL = "https://maps.isric.org/mapserv?map=/map/soilgrids.map";
const METADATA_FILE_NAME = "soilgrids-grid-metadata.json";
const METADATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EPSG_4326 = "EPSG:4326";
const DEFAULT_LIMIT = 5000;

function byLocalName(node, localName) {
  if (!node?.getElementsByTagName) return [];
  const all = node.getElementsByTagName("*");
  const result = [];
  for (let i = 0; i < all.length; i += 1) {
    const child = all[i];
    const candidate = (child.localName || child.nodeName || "").split(":").pop();
    if (candidate === localName) result.push(child);
  }
  return result;
}

function textContent(node) {
  return node?.textContent?.trim() || "";
}

function parseNumberPair(raw) {
  const values = String(raw || "")
    .trim()
    .split(/\s+/)
    .map((value) => Number(value));
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) return null;
  return [values[0], values[1]];
}

function parseEpsg(raw) {
  const value = String(raw || "");
  const match = value.match(/EPSG(?:[/:]|%3A|%2F)*(\d+)/i);
  if (match?.[1]) return `EPSG:${match[1]}`;
  if (value.toUpperCase().startsWith("EPSG:")) return value.toUpperCase();
  return null;
}

function normalizeAxisOrder(coords, axisLabels) {
  if (!Array.isArray(coords) || coords.length < 2) return coords;
  if (!Array.isArray(axisLabels) || axisLabels.length < 2) return coords;
  const first = String(axisLabels[0] || "").toLowerCase();
  const second = String(axisLabels[1] || "").toLowerCase();
  if (first.startsWith("lat") && second.startsWith("lon")) {
    return [coords[1], coords[0]];
  }
  return coords;
}

function buildCapabilitiesUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set("SERVICE", "WCS");
  url.searchParams.set("VERSION", "2.0.1");
  url.searchParams.set("REQUEST", "GetCapabilities");
  return url.toString();
}

function buildDescribeCoverageUrl(baseUrl, coverageId) {
  const url = new URL(baseUrl);
  url.searchParams.set("SERVICE", "WCS");
  url.searchParams.set("VERSION", "2.0.1");
  url.searchParams.set("REQUEST", "DescribeCoverage");
  url.searchParams.set("COVERAGEID", coverageId);
  return url.toString();
}

function parseCoverageIds(capabilitiesXml) {
  const doc = new DOMParser().parseFromString(capabilitiesXml, "application/xml");
  return byLocalName(doc, "CoverageId")
    .map((node) => textContent(node))
    .filter(Boolean);
}

function parseDescribeCoverage(xml, coverageId) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");

  const envelope = byLocalName(doc, "Envelope")[0];
  const lower = parseNumberPair(textContent(byLocalName(envelope, "lowerCorner")[0]));
  const upper = parseNumberPair(textContent(byLocalName(envelope, "upperCorner")[0]));
  const axisLabels = String(envelope?.getAttribute("axisLabels") || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const lowerXY = normalizeAxisOrder(lower, axisLabels);
  const upperXY = normalizeAxisOrder(upper, axisLabels);
  if (!lowerXY || !upperXY) {
    throw new Error("DescribeCoverage incomplet: corners absents.");
  }

  const low = parseNumberPair(textContent(byLocalName(doc, "low")[0]));
  const high = parseNumberPair(textContent(byLocalName(doc, "high")[0]));
  if (!low || !high) {
    throw new Error("DescribeCoverage incomplet: dimensions absentes.");
  }

  const width = Math.round(high[0] - low[0] + 1);
  const height = Math.round(high[1] - low[1] + 1);
  if (width <= 0 || height <= 0) {
    throw new Error("DescribeCoverage invalide: dimensions non positives.");
  }

  const minX = Math.min(lowerXY[0], upperXY[0]);
  const maxX = Math.max(lowerXY[0], upperXY[0]);
  const minY = Math.min(lowerXY[1], upperXY[1]);
  const maxY = Math.max(lowerXY[1], upperXY[1]);
  const pixelWidth = (maxX - minX) / width;
  const pixelHeight = (maxY - minY) / height;
  if (!Number.isFinite(pixelWidth) || !Number.isFinite(pixelHeight) || pixelWidth <= 0 || pixelHeight <= 0) {
    throw new Error("DescribeCoverage invalide: resolution non exploitable.");
  }

  const crs = parseEpsg(envelope?.getAttribute("srsName")) || EPSG_4326;
  return {
    source: "WCS DescribeCoverage",
    sourceUrl: DEFAULT_WCS_URL,
    coverageId,
    fetchedAt: new Date().toISOString(),
    crs,
    origin: { x: minX, y: maxY },
    extent: { minX, minY, maxX, maxY },
    pixelSize: { x: pixelWidth, y: pixelHeight },
    dimensions: { width, height },
    axisLabels,
    gridEnvelope: {
      low: { col: low[0], row: low[1] },
      high: { col: high[0], row: high[1] },
    },
  };
}

async function fetchWcsMetadata({ wcsBaseUrl = DEFAULT_WCS_URL }) {
  const capabilitiesUrl = buildCapabilitiesUrl(wcsBaseUrl);
  const capabilitiesResponse = await fetch(capabilitiesUrl);
  if (!capabilitiesResponse.ok) {
    throw new Error(`WCS GetCapabilities HTTP ${capabilitiesResponse.status}`);
  }
  const capabilitiesXml = await capabilitiesResponse.text();
  const coverageIds = parseCoverageIds(capabilitiesXml);
  if (!coverageIds.length) {
    throw new Error("Aucune couverture WCS SoilGrids detectee.");
  }

  const preferredCoverage =
    coverageIds.find((id) => /clay|soc|cec|nitrogen|bdod/i.test(id)) ||
    coverageIds[0];
  const describeUrl = buildDescribeCoverageUrl(wcsBaseUrl, preferredCoverage);
  const describeResponse = await fetch(describeUrl);
  if (!describeResponse.ok) {
    throw new Error(`WCS DescribeCoverage HTTP ${describeResponse.status}`);
  }
  const describeXml = await describeResponse.text();
  return parseDescribeCoverage(describeXml, preferredCoverage);
}

function metadataCacheFile(dataDir) {
  return path.join(dataDir, METADATA_FILE_NAME);
}

async function readMetadataFromDisk(dataDir) {
  const filePath = metadataCacheFile(dataDir);
  try {
    const [raw, fileStat] = await Promise.all([readFile(filePath, "utf-8"), stat(filePath)]);
    const parsed = JSON.parse(raw);
    return { parsed, mtimeMs: fileStat.mtimeMs };
  } catch {
    return null;
  }
}

async function writeMetadataToDisk(dataDir, metadata) {
  const filePath = metadataCacheFile(dataDir);
  await writeFile(filePath, JSON.stringify(metadata, null, 2), "utf-8");
}

export class SoilGridsGridService {
  constructor({ dataDir, wcsBaseUrl = DEFAULT_WCS_URL, metadataTtlMs = METADATA_TTL_MS } = {}) {
    this.dataDir = dataDir;
    this.wcsBaseUrl = wcsBaseUrl;
    this.metadataTtlMs = metadataTtlMs;
    this.inMemoryMetadata = null;
    this.inMemoryFetchedAt = 0;
  }

  async getMetadata() {
    const now = Date.now();
    if (this.inMemoryMetadata && now - this.inMemoryFetchedAt < this.metadataTtlMs) {
      return this.inMemoryMetadata;
    }

    const disk = await readMetadataFromDisk(this.dataDir);
    if (disk && now - disk.mtimeMs < this.metadataTtlMs) {
      this.inMemoryMetadata = disk.parsed;
      this.inMemoryFetchedAt = now;
      return disk.parsed;
    }

    try {
      const fetched = await fetchWcsMetadata({ wcsBaseUrl: this.wcsBaseUrl });
      this.inMemoryMetadata = fetched;
      this.inMemoryFetchedAt = now;
      await writeMetadataToDisk(this.dataDir, fetched);
      return fetched;
    } catch (error) {
      if (disk?.parsed) {
        this.inMemoryMetadata = disk.parsed;
        this.inMemoryFetchedAt = now;
        return disk.parsed;
      }
      throw error;
    }
  }

  transformPoint(point, fromCrs, toCrs) {
    if (!Array.isArray(point) || point.length < 2) return null;
    if (!fromCrs || !toCrs || fromCrs === toCrs) return [point[0], point[1]];
    return proj4(fromCrs, toCrs, [point[0], point[1]]);
  }

  transformBbox(bbox, fromCrs, toCrs) {
    if (!bbox || bbox.length !== 4) return null;
    if (!fromCrs || !toCrs || fromCrs === toCrs) return bbox.slice();
    const corners = [
      [bbox[0], bbox[1]],
      [bbox[0], bbox[3]],
      [bbox[2], bbox[1]],
      [bbox[2], bbox[3]],
    ]
      .map((point) => this.transformPoint(point, fromCrs, toCrs))
      .filter(Boolean);
    if (!corners.length) return null;
    const xs = corners.map((point) => point[0]);
    const ys = corners.map((point) => point[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  buildPixelFeature({ row, col, metadata }) {
    const {
      extent: { minX, maxY },
      pixelSize,
      crs,
    } = metadata;
    const minCellX = minX + col * pixelSize.x;
    const maxCellX = minCellX + pixelSize.x;
    const maxCellY = maxY - row * pixelSize.y;
    const minCellY = maxCellY - pixelSize.y;

    const ringRaster = [
      [minCellX, minCellY],
      [maxCellX, minCellY],
      [maxCellX, maxCellY],
      [minCellX, maxCellY],
      [minCellX, minCellY],
    ];
    const ringWgs84 = ringRaster.map((point) => this.transformPoint(point, crs, EPSG_4326));
    const centerRaster = [(minCellX + maxCellX) / 2, (minCellY + maxCellY) / 2];
    const centerWgs84 = this.transformPoint(centerRaster, crs, EPSG_4326);
    const bboxWgs84 = this.transformBbox([minCellX, minCellY, maxCellX, maxCellY], crs, EPSG_4326);

    return {
      type: "Feature",
      properties: {
        pixelId: `${metadata.coverageId}:${row}:${col}`,
        coverageId: metadata.coverageId,
        row,
        col,
        centerLon: Number(centerWgs84?.[0] ?? NaN),
        centerLat: Number(centerWgs84?.[1] ?? NaN),
        bboxWgs84: Array.isArray(bboxWgs84) ? bboxWgs84.map((v) => Number(v)) : null,
        bboxRaster: [minCellX, minCellY, maxCellX, maxCellY],
      },
      geometry: {
        type: "Polygon",
        coordinates: [ringWgs84],
      },
    };
  }

  buildGridCollection({ bboxWgs84, limit = DEFAULT_LIMIT }) {
    const metadata = this.inMemoryMetadata;
    const cappedLimit = this.clamp(Number(limit) || DEFAULT_LIMIT, 1, 20000);
    const bboxRaster = this.transformBbox(bboxWgs84, EPSG_4326, metadata.crs);
    if (!bboxRaster) {
      return { metadata, collection: { type: "FeatureCollection", features: [] }, featureCount: 0, truncated: false };
    }

    const extent = metadata.extent;
    const pixel = metadata.pixelSize;
    const width = metadata.dimensions.width;
    const height = metadata.dimensions.height;

    const ixMin = Math.max(bboxRaster[0], extent.minX);
    const iyMin = Math.max(bboxRaster[1], extent.minY);
    const ixMax = Math.min(bboxRaster[2], extent.maxX);
    const iyMax = Math.min(bboxRaster[3], extent.maxY);
    if (ixMin >= ixMax || iyMin >= iyMax) {
      return { metadata, collection: { type: "FeatureCollection", features: [] }, featureCount: 0, truncated: false };
    }

    const colStart = this.clamp(Math.floor((ixMin - extent.minX) / pixel.x), 0, width - 1);
    const colEnd = this.clamp(Math.ceil((ixMax - extent.minX) / pixel.x) - 1, 0, width - 1);
    const rowStart = this.clamp(Math.floor((extent.maxY - iyMax) / pixel.y), 0, height - 1);
    const rowEnd = this.clamp(Math.ceil((extent.maxY - iyMin) / pixel.y) - 1, 0, height - 1);

    const features = [];
    let truncated = false;
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        features.push(this.buildPixelFeature({ row, col, metadata }));
        if (features.length >= cappedLimit) {
          truncated = true;
          break;
        }
      }
      if (truncated) break;
    }

    return {
      metadata,
      truncated,
      featureCount: features.length,
      requestedBboxWgs84: bboxWgs84,
      requestedBboxRaster: bboxRaster,
      rowRange: [rowStart, rowEnd],
      colRange: [colStart, colEnd],
      collection: {
        type: "FeatureCollection",
        features,
      },
    };
  }

  async queryVisibleGrid({ bboxWgs84, limit = DEFAULT_LIMIT }) {
    const metadata = await this.getMetadata();
    this.inMemoryMetadata = metadata;
    return this.buildGridCollection({ bboxWgs84, limit });
  }
}


