import { haversineDistanceKm } from './spatial.js';
export function mergeStationsObservations(stations, observations, targetLat, targetLon) {
    const weights = stations.map((station) => {
        const distance = haversineDistanceKm(targetLat, targetLon, station.lat, station.lon);
        const weight = 1 / Math.max(distance, 0.1);
        return weight;
    });
    const accumulator = new Map();
    observations.forEach((stationObs, index) => {
        const weight = weights[index] ?? 0;
        stationObs.forEach((obs) => {
            const key = obs.ts;
            if (!accumulator.has(key)) {
                accumulator.set(key, {
                    fields: {},
                });
            }
            const entry = accumulator.get(key);
            ['t', 'tmin', 'tmax', 'rr', 'rr24', 'ff', 'fx', 'rh', 'p'].forEach((field) => {
                const rawValue = obs[field];
                if (typeof rawValue !== 'number' || !Number.isFinite(rawValue))
                    return;
                const existing = entry.fields[field];
                if (!existing) {
                    entry.fields[field] = { value: rawValue * weight, weight };
                }
                else {
                    existing.value += rawValue * weight;
                    existing.weight += weight;
                }
            });
        });
    });
    const merged = [];
    for (const [ts, entry] of accumulator.entries()) {
        const result = {
            ts: new Date(ts).toISOString(),
            t: null,
            tmin: null,
            tmax: null,
            rr: null,
            rr24: null,
            ff: null,
            fx: null,
            rh: null,
            p: null,
        };
        ['t', 'tmin', 'tmax', 'rr', 'rr24', 'ff', 'fx', 'rh', 'p'].forEach((field) => {
            const stats = entry.fields[field];
            if (!stats || stats.weight === 0)
                return;
            const numericValue = Number((stats.value / stats.weight).toFixed(2));
            result[field] = numericValue;
        });
        merged.push(result);
    }
    return merged.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}
