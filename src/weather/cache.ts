import localforage from 'localforage';
import type { CachedWeatherEntry, WeatherSeries, WeatherProvider } from './types';

const DEFAULT_TTL_HOURS = Number(import.meta.env.VITE_WEATHER_TTL_HOURS ?? 24);
const DEFAULT_TTL_MS = Number.isFinite(DEFAULT_TTL_HOURS)
  ? Math.max(DEFAULT_TTL_HOURS, 1) * 60 * 60 * 1000
  : 24 * 60 * 60 * 1000;

const STORE_NAME = 'weather-series';

const memoryCache = new Map<string, CachedWeatherEntry>();

const storage = typeof window !== 'undefined'
  ? localforage.createInstance({ name: 'farm-potential-weather', storeName: STORE_NAME })
  : null;

function now(): number {
  return Date.now();
}

export interface CacheSetOptions {
  ttlMs?: number;
}

export function buildCacheKey({
  provider,
  lat,
  lon,
  start,
  end,
  granularity,
}: {
  provider: WeatherProvider;
  lat: number;
  lon: number;
  start: string;
  end: string;
  granularity: string;
}): string {
  const roundedLat = lat.toFixed(4);
  const roundedLon = lon.toFixed(4);
  return `${provider}:${roundedLat}:${roundedLon}:${start}:${end}:${granularity}`;
}

async function readFromStorage(key: string): Promise<CachedWeatherEntry | null> {
  try {
    if (!storage) return memoryCache.get(key) ?? null;
    const entry = await storage.getItem<CachedWeatherEntry>(key);
    return entry ?? null;
  } catch (error) {
    console.warn('[weather][cache] Impossible de lire depuis localForage, fallback mémoire.', error);
    return memoryCache.get(key) ?? null;
  }
}

async function writeToStorage(key: string, value: CachedWeatherEntry): Promise<void> {
  memoryCache.set(key, value);
  if (!storage) return;
  try {
    await storage.setItem(key, value);
  } catch (error) {
    console.warn('[weather][cache] Impossible d\'écrire dans localForage, conservation en mémoire.', error);
  }
}

export async function getCachedWeather(key: string): Promise<WeatherSeries | null> {
  const entry = await readFromStorage(key);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    void invalidateCacheKey(key);
    return null;
  }
  return entry.payload;
}

export async function setCachedWeather(
  key: string,
  payload: WeatherSeries,
  options: CacheSetOptions = {},
): Promise<void> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const entry: CachedWeatherEntry = {
    timestamp: now(),
    expiresAt: now() + ttlMs,
    payload,
  };
  await writeToStorage(key, entry);
}

export async function invalidateCacheKey(key: string): Promise<void> {
  memoryCache.delete(key);
  if (!storage) return;
  try {
    await storage.removeItem(key);
  } catch (error) {
    console.warn('[weather][cache] Impossible de supprimer la clé', key, error);
  }
}

export async function purgeExpiredEntries(): Promise<void> {
  const entries = Array.from(memoryCache.entries());
  const expiration = now();
  entries.forEach(([key, entry]) => {
    if (entry.expiresAt <= expiration) {
      memoryCache.delete(key);
    }
  });

  if (!storage) return;
  try {
    await storage.iterate((entry: CachedWeatherEntry, key) => {
      if (entry?.expiresAt && entry.expiresAt <= expiration) {
        void storage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('[weather][cache] Impossible de purger localForage', error);
  }
}
