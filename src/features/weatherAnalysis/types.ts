import type { WeatherGranularity, WeatherProvider, WeatherSeries } from '../../weather';

export interface WeatherStationInfo {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface WeatherHourRecord {
  id_station?: string;
  dh_utc?: string;
  temperature?: string;
  pression?: string;
  humidite?: string;
  vent_moyen?: string;
  pluie_1h?: string;
  [key: string]: unknown;
}

export interface WeatherAnalysisResponse {
  source: string;
  station: string;
  dateStart: string;
  dateEnd: string;
  stations: WeatherStationInfo[];
  metadata: Record<string, string> | null;
  hourly: WeatherHourRecord[];
}

export interface StationSummary {
  id: string;
  name: string;
  city?: string | null;
  lat: number;
  lon: number;
  altitude: number | null;
  type: string | null;
  distanceKm?: number;
}

export interface StationAvailability extends StationSummary {
  availableYears: number[];
}

export interface StationAvailabilityResponse {
  stations: StationAvailability[];
  startYear: number;
  endYear: number;
}

export interface WeatherHistorySelection {
  lat: number | null;
  lon: number | null;
  start: string;
  end: string;
  granularity: WeatherGranularity;
  provider: WeatherProvider | 'auto';
  stationId?: string | null;
  stationLabel?: string | null;
  sources?: WeatherProvider[];
  series: WeatherSeries;
}
