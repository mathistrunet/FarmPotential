import express from 'express';
import { findNearestStations, type StationWithDistance } from './stations.js';
import { getObservationsForStation, type Obs } from './infoclimatClient.js';
import {
  sliceByPhase,
  indicatorsForSlice,
  aggregateIndicators,
  type YearIndicators,
  type YearSlice,
} from './indicators.js';
import {
  empiricalProbability,
  linearTrend,
  mannKendall,
  trendDirection,
  computeConfidenceScore,
  quantile,
} from './riskModels.js';
import {
  WeatherAnalysisInputSchema,
  WeatherAnalysisResponseSchema,
  type WeatherAnalysisInput,
} from './schemas.js';

export const router = express.Router();

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function mergeStationsObservations(
  stations: StationWithDistance[],
  observations: Obs[][],
  targetLat: number,
  targetLon: number
): Obs[] {
  const weights = stations.map((station) => {
    const distance = haversineDistanceKm(targetLat, targetLon, station.lat, station.lon);
    const weight = 1 / Math.max(distance, 0.1);
    return weight;
  });

  const accumulator = new Map<
    string,
    {
      fields: Partial<Record<keyof Obs, { value: number; weight: number }>>;
    }
  >();

  observations.forEach((stationObs, index) => {
    const weight = weights[index] ?? 0;
    stationObs.forEach((obs) => {
      const key = obs.ts;
      if (!accumulator.has(key)) {
        accumulator.set(key, {
          fields: {},
        });
      }
      const entry = accumulator.get(key)!;
      (['t', 'tmin', 'tmax', 'rr', 'rr24', 'ff', 'fx', 'rh', 'p'] as Array<keyof Obs>).forEach((field) => {
        const rawValue = obs[field];
        if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return;
        const existing = entry.fields[field];
        if (!existing) {
          entry.fields[field] = { value: rawValue * weight, weight };
        } else {
          existing.value += rawValue * weight;
          existing.weight += weight;
        }
      });
    });
  });

  const merged: Obs[] = [];
  for (const [ts, entry] of accumulator.entries()) {
    const result: Obs = {
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
    (['t', 'tmin', 'tmax', 'rr', 'rr24', 'ff', 'fx', 'rh', 'p'] as Array<keyof Obs>).forEach((field) => {
      const stats = entry.fields[field];
      if (!stats || stats.weight === 0) return;
      const numericValue = Number((stats.value / stats.weight).toFixed(2));
      (result as Record<string, unknown>)[field as string] = numericValue;
    });
    merged.push(result);
  }
  return merged.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}

function buildInputFromQuery(query: Record<string, unknown>): WeatherAnalysisInput {
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  const crop = typeof query.crop === 'string' && query.crop.trim() ? query.crop.trim() : 'culture';
  const phaseStart = Number(query.phaseStart ?? query.phase_start ?? query.phaseStartDay);
  const phaseEnd = Number(query.phaseEnd ?? query.phase_end ?? query.phaseEndDay);
  const yearsBack = query.yearsBack != null ? Number(query.yearsBack) : undefined;

  return WeatherAnalysisInputSchema.parse({
    lat,
    lon,
    crop,
    phase: {
      startDayOfYear: phaseStart,
      endDayOfYear: phaseEnd,
    },
    yearsBack,
  });
}

function computeCompleteness(yearIndicators: YearIndicators[], expectedYears: number): number {
  if (!expectedYears) return 0;
  return Math.min(1, yearIndicators.length / expectedYears);
}

function computeInterStationSpread(totals: number[]): number | null {
  const filtered = totals.filter((value) => Number.isFinite(value));
  if (filtered.length < 2) return null;
  const mean = filtered.reduce((acc, value) => acc + value, 0) / filtered.length;
  const variance = filtered.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (filtered.length - 1);
  return Number(Math.sqrt(variance).toFixed(2));
}

router.get('/analyze', async (req, res, next) => {
  try {
    const input = buildInputFromQuery(req.query);
    const stations = await findNearestStations(input.lat, input.lon, 3);
    if (!stations.length) {
      res.status(404).json({ error: 'Aucune station météo disponible pour cette localisation.' });
      return;
    }
    const now = new Date();
    const endISO = now.toISOString();
    const startYear = now.getUTCFullYear() - input.yearsBack + 1;
    const startISO = new Date(Date.UTC(startYear, 0, 1)).toISOString();

    const observationsByStation = await Promise.all(
      stations.map((station: StationWithDistance) => getObservationsForStation(station.id, startISO, endISO))
    );

    const mergedObservations = mergeStationsObservations(stations, observationsByStation, input.lat, input.lon);
    const slices: YearSlice[] = sliceByPhase(
      mergedObservations,
      input.phase.startDayOfYear,
      input.phase.endDayOfYear
    );
    const yearIndicators: YearIndicators[] = slices.map((slice: YearSlice) => indicatorsForSlice(slice));
    const aggregated = aggregateIndicators(yearIndicators);

    const years = yearIndicators.map((entry: YearIndicators) => entry.year);
    const rainfallSeries = yearIndicators.map((entry: YearIndicators) => entry.rainfall.total);
    const rainfallTrend = linearTrend(years, rainfallSeries);
    const rainfallMk = mannKendall(rainfallSeries);
    const rainfallDirection = trendDirection(rainfallTrend?.slope ?? rainfallMk?.tau ?? null);

    const gddKey = Object.keys(aggregated.stats.gdd)[0];
    const gddSeries = gddKey ? yearIndicators.map((entry: YearIndicators) => entry.gdd[gddKey] ?? null) : [];
    const gddTrend = gddKey ? linearTrend(years, gddSeries) : null;
    const gddMk = gddKey ? mannKendall(gddSeries) : null;
    const gddDirection = trendDirection(gddTrend?.slope ?? gddMk?.tau ?? null);

    const riskHeatwave = empiricalProbability(
      yearIndicators.map((entry: YearIndicators) => entry.heatwaves.ge35?.events ?? 0),
      (value: number) => value > 0
    );
    const riskDrySpell = empiricalProbability(
      yearIndicators.map((entry: YearIndicators) => entry.rainfall.maxDrySpell),
      (value: number) => value >= 10
    );
    const riskExtremeHeat = empiricalProbability(
      yearIndicators.map((entry: YearIndicators) => entry.heatDays.ge35),
      (value: number) => value >= 3
    );
    const riskLateFrost = empiricalProbability(
      yearIndicators.map((entry: YearIndicators) => entry.freezeEvents.lastSpringFreezeDoy ?? null),
      (value: number) => value > input.phase.startDayOfYear
    );

    const rainfallQuantiles = {
      p10: quantile(rainfallSeries, 0.1),
      p50: quantile(rainfallSeries, 0.5),
      p90: quantile(rainfallSeries, 0.9),
    };

    const expectedYears = input.yearsBack;
    const completeness = computeCompleteness(yearIndicators, expectedYears);

    const perStationTotals = observationsByStation.map((obs: Obs[]) => {
      const stationSlices = sliceByPhase(obs, input.phase.startDayOfYear, input.phase.endDayOfYear);
      const totals = stationSlices.map((slice: YearSlice) =>
        slice.obs.reduce(
          (acc: number, entry: Obs) => acc + (typeof entry.rr === 'number' && Number.isFinite(entry.rr) ? entry.rr : 0),
          0
        )
      );
      if (!totals.length) return NaN;
      const avg = totals.reduce((acc, value) => acc + value, 0) / totals.length;
      return Number(avg.toFixed(2));
    });
    const interStationStd = computeInterStationSpread(perStationTotals);

    const confidence = computeConfidenceScore({
      nYears: yearIndicators.length,
      completeness,
      interStationStd,
    });

    const response = WeatherAnalysisResponseSchema.parse({
      crop: input.crop,
      phase: input.phase,
      yearsAnalyzed: yearIndicators.length,
      stationsUsed: stations,
      indicators: aggregated,
      risks: {
        heatwave: riskHeatwave,
        drySpell: riskDrySpell,
        extremeHeat: riskExtremeHeat,
        lateFrost: riskLateFrost,
      },
      rainfallQuantiles,
      trends: {
        rainfall: {
          direction: rainfallDirection,
          ols: rainfallTrend,
          mannKendall: rainfallMk,
        },
        gdd: {
          direction: gddDirection,
          ols: gddTrend,
          mannKendall: gddMk,
        },
      },
      confidence,
      source: 'Infoclimat (Open Data)',
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
