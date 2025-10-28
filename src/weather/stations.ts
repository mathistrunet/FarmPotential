import type { StationInfo, WeatherProvider } from './types';
import { WeatherProviderError } from './types';

const stationCatalogCache = new Map<WeatherProvider, StationInfo[]>();
const pendingCatalogs = new Map<WeatherProvider, Promise<StationInfo[]>>();

export interface StationSelectionParams {
  provider: WeatherProvider;
  lat: number;
  lon: number;
  stationId?: string | null;
  signal?: AbortSignal;
  maxDistanceKm?: number;
}

interface StationWithDistance extends StationInfo {
  distanceKm: number | null;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineDistanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(b.lon - a.lon);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const aa = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return EARTH_RADIUS_KM * c;
}

async function fetchStationsFromApi(provider: WeatherProvider, signal?: AbortSignal): Promise<StationInfo[]> {
  const search = new URLSearchParams({ provider });
  const response = await fetch(`/api/weather/stations?${search.toString()}`, { signal });
  if (!response.ok) {
    throw new WeatherProviderError(provider, 'Catalogue de stations indisponible', {
      status: response.status,
    });
  }
  const json = await response.json();
  const stations = Array.isArray(json?.stations) ? json.stations : [];
  return normalizeStationList(stations, provider);
}

async function fetchStationsFromPublicDataset(provider: WeatherProvider, signal?: AbortSignal): Promise<StationInfo[]> {
  const response = await fetch('/data/weather-stations-fr.json', { signal });
  if (!response.ok) {
    return [];
  }
  const json = await response.json();
  const stations = Array.isArray(json?.stations) ? json.stations : [];
  return normalizeStationList(stations, provider);
}

function normalizeStationList(list: unknown[], provider: WeatherProvider): StationInfo[] {
  const normalized: StationInfo[] = [];
  list.forEach((entry) => {
    if (typeof entry !== 'object' || entry === null) return;
    const idRaw = (entry as { id?: unknown }).id ?? (entry as { code?: unknown }).code;
    if (idRaw == null) return;
    const id = String(idRaw);
    const lat = Number(
      (entry as { lat?: unknown }).lat ??
        (entry as { latitude?: unknown }).latitude ??
        (entry as { geometry?: { coordinates?: [number, number] } }).geometry?.coordinates?.[1] ??
        NaN,
    );
    const lon = Number(
      (entry as { lon?: unknown }).lon ??
        (entry as { longitude?: unknown }).longitude ??
        (entry as { geometry?: { coordinates?: [number, number] } }).geometry?.coordinates?.[0] ??
        NaN,
    );
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;
    const name =
      (entry as { name?: unknown }).name ??
      (entry as { station?: unknown }).station ??
      (entry as { city?: unknown }).city ??
      null;
    const elevationValue = (entry as { elevation?: unknown }).elevation ?? (entry as { alt?: unknown }).alt;
    const countryValue = (entry as { country?: unknown }).country ?? null;
    normalized.push({
      id,
      name: typeof name === 'string' ? name : null,
      lat,
      lon,
      elevation: typeof elevationValue === 'number' && Number.isFinite(elevationValue) ? elevationValue : null,
      country: typeof countryValue === 'string' ? countryValue : null,
      source: provider,
    });
  });
  return normalized;
}

async function loadCatalog(provider: WeatherProvider, signal?: AbortSignal): Promise<StationInfo[]> {
  const cached = stationCatalogCache.get(provider);
  if (cached?.length) return cached;

  const pending = pendingCatalogs.get(provider);
  if (pending) {
    return pending;
  }

  const loadPromise = (async () => {
    try {
      const stations = await fetchStationsFromApi(provider, signal);
      stationCatalogCache.set(provider, stations);
      return stations;
    } catch (error) {
      console.warn(`[weather][stations] API indisponible pour ${provider}, fallback dataset local.`, error);
      const fallback = await fetchStationsFromPublicDataset(provider, signal);
      stationCatalogCache.set(provider, fallback);
      return fallback;
    } finally {
      pendingCatalogs.delete(provider);
    }
  })();

  pendingCatalogs.set(provider, loadPromise);
  return loadPromise;
}

export async function findNearestStation(params: StationSelectionParams): Promise<StationWithDistance | null> {
  const { provider, lat, lon, stationId, signal, maxDistanceKm } = params;

  const catalog = await loadCatalog(provider, signal);
  if (!catalog.length) {
    return null;
  }

  if (stationId) {
    const station = catalog.find((entry) => entry.id === stationId);
    if (!station) {
      throw new WeatherProviderError(provider, `Station ${stationId} introuvable.`);
    }
    return { ...station, distanceKm: haversineDistanceKm({ lat, lon }, station) };
  }

  let closest: StationInfo | null = null;
  let minDistance = Infinity;
  catalog.forEach((station) => {
    const distance = haversineDistanceKm({ lat, lon }, station);
    if (!Number.isFinite(distance)) return;
    if (distance < minDistance) {
      minDistance = distance;
      closest = station;
    }
  });

  if (!closest) return null;
  if (typeof maxDistanceKm === 'number' && minDistance > maxDistanceKm) {
    return null;
  }

  return { ...(closest as StationInfo), distanceKm: minDistance };
}

export function clearStationsCache(): void {
  stationCatalogCache.clear();
  pendingCatalogs.clear();
}
