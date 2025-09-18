// rrpLocal.ts — loader MBTiles (Vector Tiles) "blindé" pour Vite/MapLibre

import initSqlJs from "sql.js/dist/sql-wasm.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { createLazyFile, type LazyFileConfig } from "sql.js-httpvfs/dist/lazyFile";
import { SeriesVtab } from "sql.js-httpvfs/dist/vtab";
import {
  toObjects,
  type LazyHttpDatabase,
  type SplitFileConfig,
  type SplitFileConfigInner,
  type SplitFileConfigPure,
} from "sql.js-httpvfs/dist/sqlite.worker";
import Pbf from "pbf";
import { VectorTile } from "@mapbox/vector-tile";
import { ungzip } from "pako";

type VTL = InstanceType<typeof VectorTile>["layers"][string];
export type TileCoord = { z: number; x: number; y: number };

type SqlJsModule = Awaited<ReturnType<typeof initSqlJs>>;
type InlineConfig = SplitFileConfigPure;
type RangeMapper = LazyFileConfig["rangeMapper"];

let sqlModulePromise: Promise<SqlJsModule> | null = null;

async function getSqlModule(): Promise<SqlJsModule> {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs({
      locateFile: () => sqlWasmUrl,
    });
  }
  return sqlModulePromise;
}

async function hydrateConfigs(configs: SplitFileConfig[]): Promise<InlineConfig[]> {
  const resolved = configs.map(async (config) => {
    if (config.from === "jsonconfig") {
      const base = typeof window !== "undefined" ? window.location.href : undefined;
      const configUrl = new URL(config.configUrl, base);
      const resp = await fetch(configUrl.toString());
      if (!resp.ok) {
        const details = await resp.text().catch(() => "");
        throw new Error(
          `Could not load httpvfs config: ${resp.status} ${resp.statusText}${details ? ` – ${details}` : ""}`
        );
      }
      const configOut = (await resp.json()) as SplitFileConfigInner;
      const inline: InlineConfig = {
        from: "inline",
        virtualFilename: config.virtualFilename,
        config:
          configOut.serverMode === "chunked"
            ? {
                ...configOut,
                urlPrefix: new URL(configOut.urlPrefix, configUrl).toString(),
              }
            : {
                ...configOut,
                url: new URL(configOut.url, configUrl).toString(),
              },
      };
      return inline;
    }
    return config;
  });
  return Promise.all(resolved);
}

async function openHttpMbtiles(url: string): Promise<LazyHttpDatabase> {
  const virtualFilename = url.split("/").pop() ?? "mbtiles.sqlite";
  const config: SplitFileConfig = {
    from: "inline",
    virtualFilename,
    config: {
      serverMode: "full",
      requestChunkSize: 4096,
      url,
    },
  };
  const sql = await getSqlModule();
  const hydratedConfigs = await hydrateConfigs([config]);
  let mainVirtualFilename = virtualFilename;
  let mainFileConfig: SplitFileConfigInner | undefined;
  const lazyFiles = new Map<string, ReturnType<typeof createLazyFile>>();
  for (const { config: cfg, virtualFilename: vf } of hydratedConfigs) {
    const id = cfg.serverMode === "chunked" ? cfg.urlPrefix : cfg.url;
    const filename = vf || id.replace(/\//g, "_");
    if (!mainVirtualFilename) {
      mainVirtualFilename = filename;
      mainFileConfig = cfg;
    }
    const suffix = cfg.cacheBust ? `?cb=${cfg.cacheBust}` : "";
    let rangeMapper: RangeMapper;
    if (cfg.serverMode === "chunked") {
      rangeMapper = (fromByte, toByte) => {
        const serverChunkId = Math.floor(fromByte / cfg.serverChunkSize);
        const serverFrom = fromByte % cfg.serverChunkSize;
        const serverTo = serverFrom + (toByte - fromByte);
        return {
          url: `${cfg.urlPrefix}${String(serverChunkId).padStart(cfg.suffixLength, "0")}${suffix}`,
          fromByte: serverFrom,
          toByte: serverTo,
        };
      };
    } else {
      rangeMapper = (fromByte, toByte) => ({
        url: `${cfg.url}${suffix}`,
        fromByte,
        toByte,
      });
    }
    const lazyFile = createLazyFile(sql.FS, "/", filename, true, true, {
      rangeMapper,
      requestChunkSize: cfg.requestChunkSize,
      fileLength: cfg.serverMode === "chunked" ? cfg.databaseLengthBytes : undefined,
      logPageReads: true,
      maxReadHeads: 3,
    });
    lazyFiles.set(filename, lazyFile);
  }

  const db = new sql.CustomDatabase(mainVirtualFilename) as LazyHttpDatabase & {
    lazyFiles: typeof lazyFiles;
    create_vtab: (ctor: typeof SeriesVtab) => void;
    query: LazyHttpDatabase["query"];
  };
  if (!mainFileConfig) {
    mainFileConfig = hydratedConfigs[0]?.config;
  }
  if (mainFileConfig) {
    const pageSizeResp = db.exec("pragma page_size; pragma cache_size=0");
    const pageSize = pageSizeResp[0]?.values?.[0]?.[0];
    if (pageSize != null && pageSize !== mainFileConfig.requestChunkSize) {
      console.warn(
        `Chunk size does not match page size: pragma page_size = ${pageSize} but chunkSize = ${mainFileConfig.requestChunkSize}`
      );
    }
  }
  db.lazyFiles = lazyFiles;
  db.create_vtab(SeriesVtab);
  db.query = ((...args: Parameters<LazyHttpDatabase["exec"]>) => toObjects(db.exec(...args))) as LazyHttpDatabase["query"];
  return db;
}

const flipY = (yXYZ: number, z: number) => (1 << z) - 1 - yXYZ;
const isGzip = (b: Uint8Array) => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;
const normalizeBytes = (b: Uint8Array) => (isGzip(b) ? ungzip(b) : b);

export function pickProp<T = unknown>(
  obj: Record<string, any>,
  names: string[]
): T | undefined {
  for (const n of names) {
    const v = obj?.[n];
    if (v !== undefined && v !== null) return v as T;
  }
  return undefined;
}

/** Convert lon/lat in degrees to XYZ tile at zoom z */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const x = Math.floor(((lon + 180) / 360) * (1 << z));
  const y = Math.floor(
    (1 -
      Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
      2 *
      (1 << z)
  );
  return { x, y };
}

export type LngLatBBox = [number, number, number, number];

export function tileToBBox(z: number, x: number, y: number): LngLatBBox {
  const scale = 1 << z;
  const west = (x / scale) * 360 - 180;
  const east = ((x + 1) / scale) * 360 - 180;
  const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))) * 180) / Math.PI;
  const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / scale))) * 180) / Math.PI;
  return [west, south, east, north];
}

export interface MbtilesReader {
  /** Nom de couche (source-layer), ex. "rrp_france" */
  layerName: string;
  /** Retourne la couche VectorTile d'une tuile (ou null si absente) */
  getTileLayer: (z: number, x: number, yXYZ: number) => VTL | null;
  /** Retourne un FeatureCollection GeoJSON (WGS84) de la tuile demandée */
  getTileGeoJSON: (z: number, x: number, yXYZ: number) => GeoJSON.FeatureCollection | null;
  /** Métadonnées utiles */
  meta: { format?: string; minzoom?: number; maxzoom?: number };
  /** Fermer la DB (libérer la mémoire) */
  close: () => void;
}

/** Ouvre un MBTiles depuis une URL (fetch) et renvoie un lecteur */
export async function loadLocalRrpMbtiles(url: string): Promise<MbtilesReader> {
  const db = await openHttpMbtiles(url);

  // --- métadonnées
  const meta: MbtilesReader["meta"] = {};
  try {
    const fmt = db.exec(`SELECT value FROM metadata WHERE name='format'`)[0]?.values?.[0]?.[0];
    meta.format = fmt ? String(fmt) : undefined;
  } catch {}
  try {
    const minz = db.exec(`SELECT value FROM metadata WHERE name='minzoom'`)[0]?.values?.[0]?.[0];
    if (minz != null) meta.minzoom = Number(minz);
  } catch {}
  try {
    const maxz = db.exec(`SELECT value FROM metadata WHERE name='maxzoom'`)[0]?.values?.[0]?.[0];
    if (maxz != null) meta.maxzoom = Number(maxz);
  } catch {}

  if (meta.format && meta.format.toLowerCase() !== "pbf") {
    throw new Error(`MBTiles non vector (format=${meta.format})`);
  }

  // --- nom de source-layer (écrit par QGIS)
  let layerName = "rrp_france";
  try {
    const raw = db.exec(`SELECT value FROM metadata WHERE name='json'`)[0]?.values?.[0]?.[0];
    if (raw) {
      const j = JSON.parse(String(raw));
      const id = j?.vector_layers?.[0]?.id;
      if (typeof id === "string" && id.length) layerName = id;
    }
  } catch {
    /* ignore, fallback rrp_france */
  }

  function getTileLayer(z: number, x: number, yXYZ: number): VTL | null {
    const yTMS = flipY(yXYZ, z);
    const stmt = db.prepare(
      `SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?`
    );
    stmt.bind([z, x, yTMS]);
    const has = stmt.step();
    if (!has) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject(); // { tile_data: Uint8Array }
    stmt.free();

    const raw: Uint8Array = row.tile_data;
    if (!(raw instanceof Uint8Array)) {
      throw new Error("tile_data n'est pas un blob binaire");
    }

    const bytes = normalizeBytes(raw);
    // DEBUG si besoin :
    // console.debug("first bytes:", Array.from(bytes.slice(0, 4)));

    const vt = new VectorTile(new Pbf(bytes));
    const lyr = vt.layers[layerName];
    return lyr ?? null;
  }

  function getTileGeoJSON(z: number, x: number, yXYZ: number): GeoJSON.FeatureCollection | null {
    const lyr = getTileLayer(z, x, yXYZ);
    if (!lyr) return null;

    const features: GeoJSON.Feature[] = [];
    for (let i = 0; i < lyr.length; i++) {
      const f = lyr.feature(i);
      // Skip features with unknown type (VectorTileFeature.type 0)
      const t = (f as any).type as number;
      if (t !== 1 && t !== 2 && t !== 3) continue;
      try {
        // ensure geometry is valid before conversion
        const geom = (f as any).loadGeometry?.();
        if (!geom || !geom.length) continue;
        // toGeoJSON(x, yXYZ, z) → GeoJSON WGS84
        const gj = f.toGeoJSON(x, yXYZ, z) as GeoJSON.Feature;
        features.push(gj);
      } catch {
        // ignore malformed feature
        continue;
      }
    }
    return { type: "FeatureCollection", features };
  }

  function close() {
    try {
      db.close();
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // allow GC to free memory
    } catch {}
  }

  return { layerName, getTileLayer, getTileGeoJSON, meta, close };
}

/* ==========
   Exemples d'usage (dans ton code appelant) :

// 1) Charger le lecteur
const reader = await loadLocalRrpMbtiles("/data/rrp_france_wgs84_shp.mbtiles");
console.log(reader.layerName, reader.meta);

// 2) Récupérer une tuile au centre de la France (z=7)
const z = 7;
const { x, y } = lonLatToTile(2.5, 46.5, z);
const fc = reader.getTileGeoJSON(z, x, y);
console.log("features in tile:", fc?.features.length);

// 3) Si tu utilises MapLibre directement en source vectorielle, tu N’AS PAS
//    besoin de décoder à la main: ajoute la source vector + "source-layer" = reader.layerName
========== */
