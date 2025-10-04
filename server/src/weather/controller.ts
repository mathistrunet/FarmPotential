import express from 'express';
import {
  findNearestStations,
  getAllStations,
  refreshStations,
  type StationWithDistance,
} from './stations.js';
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
import { mergeStationsObservations } from './observations.js';
import { buildWeatherSummary } from './summary.js';

export const router = express.Router();

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

router.get('/summary', async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const year = req.query.year != null ? Number(req.query.year) : new Date().getUTCFullYear();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ error: 'Paramètres lat/lon invalides.' });
      return;
    }
    if (!Number.isFinite(year) || year < 1900 || year > 2100) {
      res.status(400).json({ error: 'Année cible invalide.' });
      return;
    }

    const stations = await findNearestStations(lat, lon, 3);
    if (!stations.length) {
      res.status(404).json({ error: 'Aucune station météo disponible pour cette localisation.' });
      return;
    }

    const startISO = new Date(Date.UTC(year, 0, 1)).toISOString();
    const endISO = new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString();

    const observationsByStation = await Promise.all(
      stations.map((station: StationWithDistance) => getObservationsForStation(station.id, startISO, endISO))
    );

    const merged = mergeStationsObservations(stations, observationsByStation, lat, lon);
    if (!merged.length) {
      res.status(404).json({ error: "Aucune observation disponible pour l'année demandée." });
      return;
    }

    const summary = buildWeatherSummary(merged, {
      startISO,
      endISO,
      latitude: lat,
      longitude: lon,
      stations,
    });

    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/stations', async (req, res, next) => {
  try {
    if (req.query.refresh) {
      try {
        await refreshStations();
      } catch (error) {
        console.warn('Unable to refresh stations from Infoclimat:', error);
      }
    }
    const stations = await getAllStations();
    res.json({
      stations: stations.map((station) => ({
        id: station.id,
        name: station.name,
        city: station.city,
        latitude: station.lat,
        longitude: station.lon,
        elevation: station.altitude,
        type: station.type,
      })),
      source: 'Infoclimat (Open Data)',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
