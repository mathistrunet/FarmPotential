import fs from 'node:fs';
import path from 'node:path';

export interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  altitude: number | null;
  type: string | null;
}

const stationsCache: Station[] = loadStations();

function loadStations(): Station[] {
  const filePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'data/stations.json');
  const content = fs.readFileSync(filePath, 'utf-8');
  const raw = JSON.parse(content) as Array<Record<string, unknown>>;
  return raw
    .map((entry) => {
      const id = typeof entry.id === 'string' ? entry.id : null;
      const name = typeof entry.name === 'string' ? entry.name : undefined;
      const lat = typeof entry.lat === 'number' ? entry.lat : undefined;
      const lon = typeof entry.lon === 'number' ? entry.lon : undefined;
      if (!id || lat == null || lon == null) {
        return null;
      }
      return {
        id,
        name: name ?? id,
        lat,
        lon,
        altitude: typeof entry.altitude === 'number' ? entry.altitude : null,
        type: typeof entry.type === 'string' ? entry.type : null,
      } satisfies Station;
    })
    .filter((station): station is Station => Boolean(station));
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type StationWithDistance = Station & { distanceKm: number };

export async function findNearestStations(lat: number, lon: number, n = 3): Promise<StationWithDistance[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Latitude/longitude invalides pour la recherche de stations.');
  }

  const sorted = stationsCache
    .map((station) => ({
      station,
      distance: haversineDistanceKm(lat, lon, station.lat, station.lon),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(1, n))
    .map(({ station, distance }) => ({ ...station, distanceKm: distance }));

  return sorted;
}

export function getAllStations(): Station[] {
  return stationsCache;
}
