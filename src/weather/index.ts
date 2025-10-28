import { fetchInfoclimat } from './providers/infoclimat';
import { fetchMeteostat } from './providers/meteostat';
import { fetchOpenMeteo } from './providers/openmeteo';
import { buildCacheKey, getCachedWeather, setCachedWeather } from './cache';
import type { WeatherRequestParams, WeatherSeries, WeatherProvider, WeatherSeriesMeta } from './types';
import { WeatherProviderError } from './types';

function normalizeIso(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Date invalide: ${input}`);
  }
  if (input.length === 10) {
    return `${input}T00:00:00Z`;
  }
  return date.toISOString();
}

type ProviderFetch = (params: WeatherRequestParams) => Promise<WeatherSeries>;

const PROVIDER_IMPLEMENTATIONS: Record<WeatherProvider, ProviderFetch> = {
  'infoclimat': fetchInfoclimat,
  'meteostat': fetchMeteostat,
  'open-meteo': fetchOpenMeteo,
};

const PROVIDER_NAMES: Record<WeatherProvider, string> = {
  'infoclimat': 'Infoclimat',
  'meteostat': 'Meteostat',
  'open-meteo': 'Open-Meteo / ERA5',
};

function determineProviders(params: WeatherRequestParams): WeatherProvider[] {
  if (params.provider && params.provider !== 'auto') {
    return [params.provider];
  }
  const order: WeatherProvider[] = [];
  if (import.meta.env.VITE_INFOCLIMAT_TOKEN) {
    order.push('infoclimat');
  }
  order.push('meteostat', 'open-meteo');
  return order;
}

function mergeAttributions(values: (string | undefined)[]): string | undefined {
  const unique = Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  );
  if (!unique.length) return undefined;
  return unique.join(' • ');
}

function mergeMeta(primary: WeatherSeriesMeta, secondary?: WeatherSeriesMeta): WeatherSeriesMeta {
  if (!secondary) {
    return {
      ...primary,
      sources: Array.from(new Set([...(primary.sources ?? []), primary.provider])),
    };
  }
  const sources = new Set<WeatherProvider>([
    ...(primary.sources ?? []),
    primary.provider,
    ...(secondary.sources ?? []),
    secondary.provider,
  ]);
  return {
    ...primary,
    stationId: primary.stationId ?? secondary.stationId,
    stationName: primary.stationName ?? secondary.stationName,
    tz: primary.tz ?? secondary.tz,
    license: mergeAttributions([primary.license, secondary.license]),
    attribution: mergeAttributions([primary.attribution, secondary.attribution]),
    sources: Array.from(sources),
  };
}

function mergeHourly(primary?: WeatherSeries['hourly'], secondary?: WeatherSeries['hourly']): WeatherSeries['hourly'] {
  if (!primary?.length) return secondary;
  if (!secondary?.length) return primary;
  const secondaryByTime = new Map(secondary.map((point) => [point.time, point]));
  return primary.map((point) => {
    const fallback = secondaryByTime.get(point.time);
    if (!fallback) return point;
    return {
      ...point,
      t2m: point.t2m ?? fallback.t2m ?? null,
      tp: point.tp ?? fallback.tp ?? null,
      ws: point.ws ?? fallback.ws ?? null,
      wd: point.wd ?? fallback.wd ?? null,
      rh: point.rh ?? fallback.rh ?? null,
      p: point.p ?? fallback.p ?? null,
      rad: point.rad ?? fallback.rad,
    };
  });
}

function mergeDaily(primary?: WeatherSeries['daily'], secondary?: WeatherSeries['daily']): WeatherSeries['daily'] {
  if (!primary?.length) return secondary;
  if (!secondary?.length) return primary;
  const secondaryByDate = new Map(secondary.map((point) => [point.date, point]));
  return primary.map((point) => {
    const fallback = secondaryByDate.get(point.date);
    if (!fallback) return point;
    return {
      ...point,
      tmin: point.tmin ?? fallback.tmin ?? null,
      tmax: point.tmax ?? fallback.tmax ?? null,
      tavg: point.tavg ?? fallback.tavg,
      prcp: point.prcp ?? fallback.prcp ?? null,
      ws_avg: point.ws_avg ?? fallback.ws_avg,
      rh_avg: point.rh_avg ?? fallback.rh_avg,
      p_avg: point.p_avg ?? fallback.p_avg,
      sun: point.sun ?? fallback.sun,
    };
  });
}

async function fetchWithCache(provider: WeatherProvider, params: WeatherRequestParams): Promise<WeatherSeries> {
  const key = buildCacheKey({
    provider,
    lat: params.lat,
    lon: params.lon,
    start: params.start,
    end: params.end,
    granularity: params.granularity,
  });
  const cached = await getCachedWeather(key);
  if (cached) {
    return cached;
  }
  const implementation = PROVIDER_IMPLEMENTATIONS[provider];
  const result = await implementation({ ...params, provider });
  await setCachedWeather(key, result);
  return result;
}

function needsFallback(series: WeatherSeries, granularity: WeatherRequestParams['granularity']): boolean {
  if (granularity === 'hourly') {
    return !(series.hourly && series.hourly.length);
  }
  if (granularity === 'daily') {
    return !(series.daily && series.daily.length);
  }
  return false;
}

function needsSupplement(series: WeatherSeries): boolean {
  if (!series.hourly?.length) return true;
  const hasRadiation = series.hourly.some((point) => point.rad != null);
  const hasHumidity = series.hourly.some((point) => point.rh != null);
  return !(hasRadiation && hasHumidity);
}

export async function getWeather(params: WeatherRequestParams): Promise<WeatherSeries> {
  const normalizedParams: WeatherRequestParams = {
    ...params,
    start: params.start.length === 10 ? params.start : normalizeIso(params.start).slice(0, 10),
    end: params.end.length === 10 ? params.end : normalizeIso(params.end).slice(0, 10),
    provider: params.provider,
  };

  const providers = determineProviders(normalizedParams);
  const errors: Error[] = [];
  let primarySeries: WeatherSeries | null = null;
  let primaryProvider: WeatherProvider | null = null;

  for (const provider of providers) {
    try {
      const series = await fetchWithCache(provider, normalizedParams);
      if (needsFallback(series, normalizedParams.granularity)) {
        errors.push(new WeatherProviderError(provider, 'Données incomplètes.'));
        continue;
      }
      primarySeries = series;
      primaryProvider = provider;
      break;
    } catch (error) {
      errors.push(error as Error);
      continue;
    }
  }

  if (!primarySeries || !primaryProvider) {
    const message = errors.length ? errors[0].message : 'Aucun fournisseur météo disponible.';
    throw new WeatherProviderError('open-meteo', message);
  }

  let mergedSeries = primarySeries;

  if (needsSupplement(primarySeries)) {
    for (const provider of providers) {
      if (provider === primaryProvider) continue;
      try {
        const fallbackSeries = await fetchWithCache(provider, normalizedParams);
        mergedSeries = {
          meta: mergeMeta(mergedSeries.meta, fallbackSeries.meta),
          hourly: mergeHourly(mergedSeries.hourly, fallbackSeries.hourly),
          daily: mergeDaily(mergedSeries.daily, fallbackSeries.daily),
        };
        if (!needsSupplement(mergedSeries)) {
          break;
        }
      } catch (error) {
        errors.push(error as Error);
        continue;
      }
    }
  } else {
    mergedSeries = {
      meta: mergeMeta(mergedSeries.meta),
      hourly: mergedSeries.hourly,
      daily: mergedSeries.daily,
    };
  }

  const providerLabels = mergedSeries.meta.sources?.map((provider) => PROVIDER_NAMES[provider] ?? provider);
  mergedSeries.meta.attribution = mergeAttributions([
    mergedSeries.meta.attribution,
    mergedSeries.meta.license,
    providerLabels?.length ? `Données ${providerLabels.join(' + ')}` : undefined,
  ]);

  return mergedSeries;
}

export type { WeatherSeries } from './types';
export * from './types';
export { findNearestStation } from './stations';
