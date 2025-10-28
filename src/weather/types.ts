export type WeatherProvider = 'infoclimat' | 'meteostat' | 'open-meteo';

export type WeatherGranularity = 'hourly' | 'daily';

export interface WeatherPointHourly {
  time: string;
  t2m: number | null;
  tp: number | null;
  ws: number | null;
  wd: number | null;
  rh: number | null;
  p: number | null;
  rad?: number | null;
}

export interface WeatherPointDaily {
  date: string;
  tmin: number | null;
  tmax: number | null;
  tavg?: number | null;
  prcp: number | null;
  ws_avg?: number | null;
  rh_avg?: number | null;
  p_avg?: number | null;
  sun?: number | null;
}

export interface WeatherSeriesMeta {
  provider: WeatherProvider;
  stationId?: string;
  stationName?: string;
  lat: number;
  lon: number;
  tz?: string;
  license?: string;
  attribution?: string;
  sources?: WeatherProvider[];
}

export interface WeatherSeries {
  meta: WeatherSeriesMeta;
  hourly?: WeatherPointHourly[];
  daily?: WeatherPointDaily[];
}

export interface WeatherRequestParams {
  lat: number;
  lon: number;
  start: string;
  end: string;
  granularity: WeatherGranularity;
  provider?: WeatherProvider | 'auto';
  stationId?: string;
  signal?: AbortSignal;
}

export interface StationInfo {
  id: string;
  name?: string | null;
  lat: number;
  lon: number;
  elevation?: number | null;
  country?: string | null;
  source?: WeatherProvider;
}

export class WeatherProviderError extends Error {
  public readonly provider: WeatherProvider;
  public readonly status?: number;
  public readonly code?: string;
  public readonly isRetryable: boolean;

  constructor(
    provider: WeatherProvider,
    message: string,
    options: { status?: number; code?: string; cause?: unknown; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'WeatherProviderError';
    this.provider = provider;
    this.status = options.status;
    this.code = options.code;
    this.isRetryable = Boolean(options.retryable);
    if (options.cause) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class WeatherNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeatherNormalizationError';
  }
}

export type WeatherSeriesFragment = Partial<Omit<WeatherSeries, 'meta'>> & {
  meta: Partial<WeatherSeriesMeta> & Pick<WeatherSeriesMeta, 'provider' | 'lat' | 'lon'>;
};

export interface CachedWeatherEntry {
  timestamp: number;
  expiresAt: number;
  payload: WeatherSeries;
}

export type ProviderRateLimitConfig = {
  tokensPerInterval: number;
  intervalMs: number;
  bucketSize: number;
};
