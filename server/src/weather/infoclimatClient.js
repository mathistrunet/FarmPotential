import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { hashRequest, getCachedRequest, setCachedRequest, listObservations, upsertObservations, } from './db.js';
import { INFOCLIMAT_API_KEY, INFOCLIMAT_OBSERVATIONS_URL, assertApiKey, fetchCsv, fetchJson, toNumber, } from './infoclimatShared.js';
const ObsSchema = z.object({
    ts: z.string(),
    t: z.number().nullable(),
    tmin: z.number().nullable(),
    tmax: z.number().nullable(),
    rr: z.number().nullable(),
    rr24: z.number().nullable(),
    ff: z.number().nullable(),
    fx: z.number().nullable(),
    rh: z.number().nullable(),
    p: z.number().nullable(),
});
const CACHE_TTL_HOURS = Number(process.env.WEATHER_CACHE_TTL_HOURS ?? '24');
function parseCsvObservations(csvContent) {
    const rows = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ';',
    });
    return rows
        .map((row) => {
        const tsString = String(row['date_iso'] ?? row['date'] ?? row['time'] ?? '');
        const date = new Date(tsString);
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        return ObsSchema.parse({
            ts: date.toISOString(),
            t: toNumber(row['t'] ?? row['temperature']),
            tmin: toNumber(row['tn'] ?? row['tmin']),
            tmax: toNumber(row['tx'] ?? row['tmax']),
            rr: toNumber(row['rr'] ?? row['precip'] ?? row['rr1h']),
            rr24: toNumber(row['rr24'] ?? row['precip24']),
            ff: toNumber(row['ff'] ?? row['wind_avg']),
            fx: toNumber(row['fx'] ?? row['wind_gust']),
            rh: toNumber(row['humidity'] ?? row['rh']),
            p: toNumber(row['p'] ?? row['pressure']),
        });
    })
        .filter((value) => Boolean(value));
}
function normalizeDateString(value) {
    if (!value)
        return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date.toISOString();
}
function isTimestampKey(key) {
    if (typeof key !== 'string' || key.length < 4)
        return false;
    return !Number.isNaN(Date.parse(key));
}
function extractNumericValue(value, preferredKeys = []) {
    if (value == null)
        return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        return toNumber(value);
    }
    if (typeof value === 'object') {
        for (const key of preferredKeys) {
            if (key in value) {
                const nested = extractNumericValue(value[key]);
                if (nested != null)
                    return nested;
            }
        }
        for (const key of ['value', 'avg', 'mean', 'moy', 'data', 'val', 'v']) {
            if (key in value) {
                const nested = extractNumericValue(value[key]);
                if (nested != null)
                    return nested;
            }
        }
        for (const key of ['min', 'max', 'sum', 'total']) {
            if (key in value) {
                const nested = extractNumericValue(value[key]);
                if (nested != null)
                    return nested;
            }
        }
    }
    return null;
}
function buildObservationFromRecord(record, explicitTs) {
    const tsCandidate = explicitTs ?? record.date_iso ?? record.date ?? record.datetime ?? record.time ?? record.ts;
    const ts = normalizeDateString(tsCandidate);
    if (!ts)
        return null;
    const pick = (keys, preferred) => {
        for (const key of keys) {
            if (key in record) {
                const value = extractNumericValue(record[key], preferred);
                if (value != null)
                    return value;
            }
        }
        return null;
    };
    const t = pick(['t', 'temperature', 'temp', 'ta', 'tavg'], ['value', 'avg', 'mean']);
    const tmin = pick(['tmin', 'tn', 'temperature_min', 'temp_min', 'min_temperature'], ['min', 'value']);
    const tmax = pick(['tmax', 'tx', 'temperature_max', 'temp_max', 'max_temperature'], ['max', 'value']);
    const rr = pick(['rr', 'rr1h', 'precip', 'precipitation', 'rain', 'rain_1h', 'rr_1h'], ['sum', 'total', 'value']);
    const rr24 = pick(['rr24', 'precip24', 'precipitation_24h', 'rain_24h', 'rr_24h'], ['sum', 'total', 'value']);
    const ff = pick(['ff', 'wind', 'wind_avg', 'wind_speed', 'wind_mean'], ['avg', 'mean', 'value']);
    const fx = pick(['fx', 'wind_gust', 'gust', 'wind_gust_max', 'wind_max'], ['max', 'value']);
    const rh = pick(['rh', 'humidity', 'relative_humidity'], ['avg', 'mean', 'value']);
    const p = pick(['p', 'pressure', 'press', 'pressure_station'], ['avg', 'mean', 'value']);
    if ([t, tmin, tmax, rr, rr24, ff, fx, rh, p].every((value) => value == null)) {
        return null;
    }
    return ObsSchema.parse({ ts, t, tmin, tmax, rr, rr24, ff, fx, rh, p });
}
function parseJsonObservations(payload, stationId) {
    const visited = new WeakSet();
    const observations = new Map();
    function visit(node, explicitTs) {
        if (!node || typeof node !== 'object')
            return;
        if (visited.has(node))
            return;
        visited.add(node);
        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item, explicitTs);
            }
            return;
        }
        const obs = buildObservationFromRecord(node, explicitTs);
        if (obs) {
            observations.set(obs.ts, obs);
        }
        for (const [key, value] of Object.entries(node)) {
            if (!value || typeof value !== 'object')
                continue;
            if (isTimestampKey(key)) {
                visit(value, key);
            }
            else {
                visit(value, explicitTs);
            }
        }
    }
    const stationPayloadCandidates = [];
    const enqueueIfObject = (value) => {
        if (value && typeof value === 'object') {
            stationPayloadCandidates.push(value);
        }
    };
    enqueueIfObject(payload);
    while (stationPayloadCandidates.length) {
        const candidate = stationPayloadCandidates.shift();
        if (!candidate)
            continue;
        if (stationId in candidate) {
            visit(candidate[stationId]);
            break;
        }
        if (Array.isArray(candidate.stations)) {
            for (const item of candidate.stations) {
                if (item && typeof item === 'object') {
                    if (item.id === stationId || item.code === stationId || item.identifier === stationId) {
                        visit(item);
                        return [...observations.values()].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
                    }
                    enqueueIfObject(item);
                }
            }
        }
        for (const value of Object.values(candidate)) {
            if (value && typeof value === 'object') {
                if (value === candidate)
                    continue;
                if (stationId in value) {
                    visit(value[stationId]);
                    return [...observations.values()].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
                }
                enqueueIfObject(value);
            }
        }
    }
    return [...observations.values()].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}
function parseInfoclimatObservations(payload, stationId) {
    if (!payload || typeof payload !== 'object') {
        return [];
    }
    return parseJsonObservations(payload, stationId);
}
async function fetchObservationsFromApi(stationId, startISO, endISO) {
    assertApiKey();
    const url = new URL(INFOCLIMAT_OBSERVATIONS_URL);
    const formatParam = (url.searchParams.get('format') ?? '').toLowerCase();
    const isJson = formatParam === 'json' || url.pathname.endsWith('.json') || url.searchParams.has('stations[]');
    url.searchParams.delete('stations[]');
    url.searchParams.delete('station');
    url.searchParams.delete('start');
    url.searchParams.delete('end');
    url.searchParams.delete('token');
    if (isJson) {
        if (!url.searchParams.has('version')) {
            url.searchParams.set('version', '2');
        }
        if (!url.searchParams.has('method')) {
            url.searchParams.set('method', 'get');
        }
        if (!url.searchParams.has('format')) {
            url.searchParams.set('format', 'json');
        }
        url.searchParams.append('stations[]', stationId);
        url.searchParams.set('start', startISO.split('T')[0]);
        url.searchParams.set('end', endISO.split('T')[0]);
        url.searchParams.set('token', INFOCLIMAT_API_KEY);
        const payload = await fetchJson(url);
        return parseInfoclimatObservations(payload, stationId);
    }
    url.searchParams.set('station', stationId);
    url.searchParams.set('start', startISO);
    url.searchParams.set('end', endISO);
    url.searchParams.set('token', INFOCLIMAT_API_KEY);
    const csvContent = await fetchCsv(url);
    return parseCsvObservations(csvContent);
}
function mergeObservations(existing, incoming) {
    const merged = new Map();
    for (const obs of existing) {
        merged.set(obs.ts, obs);
    }
    for (const obs of incoming) {
        merged.set(obs.ts, obs);
    }
    return [...merged.values()].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}
function mapRecordToObs(record) {
    return {
        ts: new Date(record.ts).toISOString(),
        t: record.t,
        tmin: record.tmin,
        tmax: record.tmax,
        rr: record.rr,
        rr24: record.rr24,
        ff: record.wind,
        fx: record.windGust,
        rh: record.humidity,
        p: record.pressure,
    };
}
export async function getObservationsForStation(stationId, startISO, endISO) {
    const cacheKey = hashRequest(['station', stationId, startISO, endISO]);
    const cached = getCachedRequest(cacheKey, CACHE_TTL_HOURS);
    if (Array.isArray(cached) && cached.length) {
        return cached.map((obs) => ObsSchema.parse(obs));
    }
    const stored = listObservations(stationId, startISO, endISO).map(mapRecordToObs);
    let observations = stored;
    const coversInterval = stored.length > 0 &&
        new Date(stored[0]?.ts ?? 0).getTime() <= new Date(startISO).getTime() &&
        new Date(stored[stored.length - 1]?.ts ?? 0).getTime() >= new Date(endISO).getTime();
    if (!coversInterval) {
        const remote = await fetchObservationsFromApi(stationId, startISO, endISO);
        observations = mergeObservations(observations, remote);
        upsertObservations(stationId, remote.map((obs) => ({
            stationId,
            ts: obs.ts,
            t: obs.t,
            tmin: obs.tmin,
            tmax: obs.tmax,
            rr: obs.rr,
            rr24: obs.rr24,
            wind: obs.ff,
            windGust: obs.fx,
            humidity: obs.rh,
            pressure: obs.p,
        })));
    }
    const startMs = new Date(startISO).getTime();
    const endMs = new Date(endISO).getTime();
    const filtered = observations.filter((obs) => {
        const ts = new Date(obs.ts).getTime();
        return ts >= startMs && ts <= endMs;
    });
    if (filtered.length) {
        setCachedRequest(cacheKey, filtered);
    }
    return filtered;
}
