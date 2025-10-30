import { upsertStations } from './db.js';
import { INFOCLIMAT_STATIONS_URL, fetchJson, toNumber, } from './infoclimatShared.js';
function pickString(row, keys) {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return null;
}
function asRecord(value) {
    return value && typeof value === 'object' ? value : {};
}
function asGeometry(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const geometry = value;
    if (!('type' in geometry) || typeof geometry.type !== 'string') {
        return null;
    }
    if (!('coordinates' in geometry) || !Array.isArray(geometry.coordinates)) {
        return null;
    }
    if (geometry.coordinates.length < 2) {
        return null;
    }
    return geometry;
}
function pickLatLon(row, geometry) {
    const lat =
        toNumber(row['lat'] ??
            row['latitude'] ??
            row['lat_dd'] ??
            row['latdec'] ??
            row['latitude_dd'] ??
            row['latitude_dec']) ?? null;
    const lon =
        toNumber(row['lon'] ??
            row['longitude'] ??
            row['lon_dd'] ??
            row['londec'] ??
            row['longitude_dd'] ??
            row['longitude_dec']) ?? null;
    if (lat != null && lon != null) {
        return { lat, lon };
    }
    if (geometry && typeof geometry.type === 'string' && geometry.type.toLowerCase() === 'point') {
        const [lonValue, latValue] = geometry.coordinates;
        const geoLon = toNumber(lonValue);
        const geoLat = toNumber(latValue);
        if (geoLat != null && geoLon != null) {
            return { lat: geoLat, lon: geoLon };
        }
    }
    return { lat: null, lon: null };
}
function normaliseStation(feature) {
    const row = asRecord(feature?.properties);
    const geometry = asGeometry(feature?.geometry);
    const { lat, lon } = pickLatLon(row, geometry);
    const id = pickString(row, ['id', 'station', 'station_id', 'code', 'identifiant', 'numero']);
    if (!id || lat == null || lon == null) {
        return null;
    }
    const name = pickString(row, ['name', 'nom', 'station_name', 'label', 'nom_station', 'station_nom', 'station_label']);
    const city = pickString(row, ['city', 'commune', 'ville', 'nom_commune', 'lieu', 'localite']) ?? null;
    const altitude = toNumber(row['altitude'] ?? row['alt'] ?? row['elevation'] ?? row['alt_m'] ?? row['hauteur']) ?? null;
    const type = pickString(row, ['type', 'categorie', 'category', 'nature', 'station_type']);
    return {
        id,
        name: name ?? id,
        city,
        lat,
        lon,
        altitude,
        type: type ?? pickString(row, ['nature', 'station_nature', 'classe']) ?? null,
    };
}
export async function fetchStationsCatalog() {
    const payload = await fetchJson(INFOCLIMAT_STATIONS_URL);
    const type = typeof payload?.type === 'string' ? payload.type.toLowerCase() : null;
    if (type !== 'featurecollection' || !Array.isArray(payload?.features)) {
        throw new Error('Infoclimat stations catalog payload was not a FeatureCollection');
    }
    const stations = payload.features
        .map(normaliseStation)
        .filter((value) => Boolean(value));
    if (stations.length) {
        upsertStations(stations);
    }
    return stations;
}
