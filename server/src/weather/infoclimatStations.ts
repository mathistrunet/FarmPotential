import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { upsertStations } from './db.js';
import type { Station } from './stations.js';
import {
  INFOCLIMAT_API_KEY,
  INFOCLIMAT_STATIONS_URL,
  assertApiKey,
  fetchCsv,
  toNumber,
} from './infoclimatShared.js';

const StationCsvSchema = z.object({}).catchall(z.unknown());

type RawStation = z.infer<typeof StationCsvSchema>;

function pickString(row: RawStation, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normaliseStation(row: RawStation): Station | null {
  const id = pickString(row, ['id', 'station', 'station_id', 'code', 'identifiant', 'numero']);
  const lat = toNumber(
    row['lat'] ??
      row['latitude'] ??
      row['lat_dd'] ??
      row['latdec'] ??
      row['latitude_dd'] ??
      row['latitude_dec']
  );
  const lon = toNumber(
    row['lon'] ??
      row['longitude'] ??
      row['lon_dd'] ??
      row['londec'] ??
      row['longitude_dd'] ??
      row['longitude_dec']
  );

  if (!id || lat == null || lon == null) {
    return null;
  }

  const name = pickString(
    row,
    ['name', 'nom', 'station_name', 'label', 'nom_station', 'station_nom', 'station_label']
  );
  const city =
    pickString(row, ['city', 'commune', 'ville', 'nom_commune', 'lieu', 'localite']) ?? null;
  const altitude =
    toNumber(row['altitude'] ?? row['alt'] ?? row['elevation'] ?? row['alt_m'] ?? row['hauteur']) ?? null;
  const type = pickString(row, ['type', 'categorie', 'category', 'nature', 'station_type']);

  return {
    id,
    name: name ?? id,
    city,
    lat,
    lon,
    altitude,
    type: type ?? null,
  } satisfies Station;
}

export async function fetchStationsCatalog(): Promise<Station[]> {
  assertApiKey();
  const url = new URL(INFOCLIMAT_STATIONS_URL);
  url.searchParams.set('token', INFOCLIMAT_API_KEY);

  const csvContent = await fetchCsv(url);
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ';',
  }) as RawStation[];

  const stations = rows.map(normaliseStation).filter((value): value is Station => Boolean(value));
  if (stations.length) {
    upsertStations(stations);
  }
  return stations;
}
