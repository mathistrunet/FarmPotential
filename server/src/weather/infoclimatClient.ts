import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import {
  hashRequest,
  getCachedRequest,
  setCachedRequest,
  listObservations,
  upsertObservations,
} from './db.js';
import type { ObservationRecord } from './db.js';
import {
  INFOCLIMAT_API_KEY,
  INFOCLIMAT_OBSERVATIONS_URL,
  assertApiKey,
  fetchCsv,
  toNumber,
} from './infoclimatShared.js';

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

export type Obs = z.infer<typeof ObsSchema>;

const CACHE_TTL_HOURS = Number(process.env.WEATHER_CACHE_TTL_HOURS ?? '24');
function parseCsvObservations(csvContent: string): Obs[] {
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ';',
  }) as Array<Record<string, unknown>>;
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
    .filter((value): value is Obs => Boolean(value));
}

async function fetchObservationsFromApi(stationId: string, startISO: string, endISO: string): Promise<Obs[]> {
  assertApiKey();
  const url = new URL(INFOCLIMAT_OBSERVATIONS_URL);
  url.searchParams.set('station', stationId);
  url.searchParams.set('start', startISO);
  url.searchParams.set('end', endISO);
  url.searchParams.set('token', INFOCLIMAT_API_KEY);

  const csvContent = await fetchCsv(url);
  return parseCsvObservations(csvContent);
}

function mergeObservations(existing: Obs[], incoming: Obs[]): Obs[] {
  const merged = new Map<string, Obs>();
  for (const obs of existing) {
    merged.set(obs.ts, obs);
  }
  for (const obs of incoming) {
    merged.set(obs.ts, obs);
  }
  return [...merged.values()].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}

function mapRecordToObs(record: ObservationRecord): Obs {
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

export async function getObservationsForStation(
  stationId: string,
  startISO: string,
  endISO: string
): Promise<Obs[]> {
  const cacheKey = hashRequest(['station', stationId, startISO, endISO]);
  const cached = getCachedRequest(cacheKey, CACHE_TTL_HOURS) as Obs[] | null;
  if (Array.isArray(cached) && cached.length) {
    return cached.map((obs) => ObsSchema.parse(obs));
  }

  const stored = listObservations(stationId, startISO, endISO).map(mapRecordToObs);
  let observations = stored;
  const coversInterval =
    stored.length > 0 &&
    new Date(stored[0]?.ts ?? 0).getTime() <= new Date(startISO).getTime() &&
    new Date(stored[stored.length - 1]?.ts ?? 0).getTime() >= new Date(endISO).getTime();

  if (!coversInterval) {
    const remote = await fetchObservationsFromApi(stationId, startISO, endISO);
    observations = mergeObservations(observations, remote);
    upsertObservations(
      stationId,
      remote.map((obs) => ({
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
      }))
    );
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
