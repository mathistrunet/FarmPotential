import fs from 'node:fs';
import path from 'node:path';
import { listStations as listStationsFromDb, upsertStations } from './db.js';
import { fetchStationsCatalog } from './infoclimatStations.js';
import { haversineDistanceKm } from './spatial.js';
let stationsCache = null;
let loadingPromise = null;
function loadSnapshot() {
    try {
        const filePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'data/stations.json');
        const content = fs.readFileSync(filePath, 'utf-8');
        const raw = JSON.parse(content);
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
                city: typeof entry.city === 'string' && entry.city ? entry.city : null,
                lat,
                lon,
                altitude: typeof entry.altitude === 'number' ? entry.altitude : null,
                type: typeof entry.type === 'string' ? entry.type : null,
            };
        })
            .filter((station) => Boolean(station));
    }
    catch (error) {
        console.warn('Unable to read stations snapshot:', error);
        return [];
    }
}
async function loadStations() {
    if (stationsCache)
        return stationsCache;
    if (loadingPromise)
        return loadingPromise;
    loadingPromise = (async () => {
        const fromDb = listStationsFromDb();
        if (fromDb.length) {
            stationsCache = fromDb;
            return fromDb;
        }
        try {
            const fetched = await fetchStationsCatalog();
            if (fetched.length) {
                stationsCache = fetched;
                return fetched;
            }
        }
        catch (error) {
            console.warn('Unable to fetch stations from Infoclimat:', error);
        }
        const snapshot = loadSnapshot();
        if (snapshot.length) {
            upsertStations(snapshot);
        }
        stationsCache = snapshot;
        return snapshot;
    })();
    try {
        return await loadingPromise;
    }
    finally {
        loadingPromise = null;
    }
}
export async function findNearestStations(lat, lon, n = 3) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error('Latitude/longitude invalides pour la recherche de stations.');
    }
    const stations = await loadStations();
    const sorted = stations
        .map((station) => ({
        station,
        distance: haversineDistanceKm(lat, lon, station.lat, station.lon),
    }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, Math.max(1, n))
        .map(({ station, distance }) => ({ ...station, distanceKm: distance }));
    return sorted;
}
export async function getAllStations() {
    return loadStations();
}
export async function refreshStations() {
    const fetched = await fetchStationsCatalog();
    if (fetched.length) {
        stationsCache = fetched;
    }
    return fetched;
}
