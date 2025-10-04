import { parse } from 'csv-parse/sync';
import fetch from 'node-fetch';
import { z } from 'zod';
import {
  hashRequest,
  getCachedRequest,
  setCachedRequest,
  listObservations,
  upsertObservations,
} from './db.js';
import type { ObservationRecord } from './db.js';

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

const API_KEY = process.env.INFOCLIMAT_API_KEY ?? '';
const API_BASE = process.env.INFOCLIMAT_API_BASE ?? 'https://www.infoclimat.fr/opendata/produits-stations.csv';
const CACHE_TTL_HOURS = Number(process.env.WEATHER_CACHE_TTL_HOURS ?? '24');
const MIN_REQUEST_INTERVAL_MS = Number(process.env.WEATHER_API_MIN_INTERVAL_MS ?? '900');
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

let lastRequestTimestamp = 0;

function assertApiKey() {
  if (!API_KEY) {
    throw new Error('Missing INFOCLIMAT_API_KEY environment variable');
  }
}

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTimestamp;
  const wait = MIN_REQUEST_INTERVAL_MS - elapsed;
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestTimestamp = Date.now();
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

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
  const url = new URL(API_BASE);
  url.searchParams.set('station', stationId);
  url.searchParams.set('start', startISO);
  url.searchParams.set('end', endISO);
  url.searchParams.set('token', API_KEY);

  let attempt = 0;
  for (;;) {
    try {
      await rateLimit();
      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': 'FarmPotential/WeatherAnalysis' },
      });
      if (!response.ok) {
        throw new Error(`Infoclimat API responded with status ${response.status}`);
      }
      const text = await response.text();
      return parseCsvObservations(text);
    } catch (error) {
      attempt += 1;
      if (attempt >= MAX_RETRIES) {
        throw error;
      }
      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
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
