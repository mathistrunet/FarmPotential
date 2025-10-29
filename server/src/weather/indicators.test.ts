import { describe, it, expect } from 'vitest';
import {
  aggregateIndicators,
  indicatorsForSlice,
  maxRun,
  computeHeatwaveStats,
  type YearIndicators,
  type YearSlice,
} from './indicators.js';
import type { Obs } from './infoclimatClient.js';

function createObservation(year: number, dayOfYear: number, values: Partial<Obs>): Obs {
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(dayOfYear);
  return {
    ts: date.toISOString(),
    t: null,
    tmin: null,
    tmax: null,
    rr: null,
    rr24: null,
    ff: null,
    fx: null,
    rh: null,
    p: null,
    ...values,
  };
}

describe('indicatorsForSlice', () => {
  it('compte correctement les jours de gel', () => {
    const slice: YearSlice = {
      year: 2022,
      obs: [
        createObservation(2022, 10, { tmin: -3, tmax: 5, rr: 2 }),
        createObservation(2022, 11, { tmin: -1, tmax: 6, rr: 0 }),
        createObservation(2022, 12, { tmin: 1, tmax: 7, rr: 0 }),
        createObservation(2022, 13, { tmin: -5, tmax: 4, rr: 1 }),
      ],
    };

    const indicators = indicatorsForSlice(slice);
    expect(indicators.freezeDays.le0).toBe(3);
    expect(indicators.freezeDays.leMinus2).toBe(2);
    expect(indicators.freezeDays.leMinus4).toBe(1);
  });

  it('détecte les vagues de chaleur', () => {
    const slice: YearSlice = {
      year: 2021,
      obs: [
        createObservation(2021, 150, { tmax: 36, tmin: 18, rr: 0 }),
        createObservation(2021, 151, { tmax: 37, tmin: 19, rr: 0 }),
        createObservation(2021, 152, { tmax: 38, tmin: 20, rr: 0 }),
        createObservation(2021, 153, { tmax: 29, tmin: 18, rr: 5 }),
        createObservation(2021, 154, { tmax: 35, tmin: 19, rr: 0 }),
        createObservation(2021, 155, { tmax: 36, tmin: 19, rr: 0 }),
        createObservation(2021, 156, { tmax: 37, tmin: 20, rr: 0 }),
      ],
    };

    const indicators = indicatorsForSlice(slice);
    expect(indicators.heatwaves.ge35.events).toBeGreaterThanOrEqual(2);
    expect(indicators.heatwaves.ge35.longest).toBeGreaterThanOrEqual(3);
  });

  it('calcule les séquences sèches', () => {
    const slice: YearSlice = {
      year: 2020,
      obs: [
        createObservation(2020, 100, { rr: 0 }),
        createObservation(2020, 101, { rr: 0 }),
        createObservation(2020, 102, { rr: 2 }),
        createObservation(2020, 103, { rr: 0.5 }),
        createObservation(2020, 104, { rr: 0 }),
        createObservation(2020, 105, { rr: 0 }),
        createObservation(2020, 106, { rr: 0 }),
        createObservation(2020, 107, { rr: 5 }),
      ],
    };

    const indicators = indicatorsForSlice(slice);
    expect(indicators.rainfall.maxDrySpell).toBe(4);
    expect(indicators.rainfall.dryDays).toBe(6);
  });
});

describe('maxRun', () => {
  it('retourne la plus longue séquence vraie', () => {
    expect(maxRun([true, true, false, true, true, true, false])).toBe(3);
    expect(maxRun([false, false, false])).toBe(0);
    expect(maxRun([true, true, true, true])).toBe(4);
  });
});

describe('computeHeatwaveStats', () => {
  it('compte les événements consécutifs', () => {
    const stats = computeHeatwaveStats([35, 36, 37, 28, 36, 37, 38], 35, 3);
    expect(stats.events).toBe(2);
    expect(stats.longest).toBe(3);
    expect(stats.totalDays).toBe(6);
  });
});

function createYearIndicators(year: number, rainfallTotal: number): YearIndicators {
  return {
    year,
    gdd: { base10: 100 + (year % 5) * 5 },
    hdd: { base0: 50 + (year % 3) * 2 },
    freezeDays: { le0: 5, leMinus2: 3, leMinus4: 1 },
    heatDays: { ge30: 2, ge32: 1, ge35: 0 },
    heatwaves: {
      ge32x3: { events: 0, totalDays: 0, longest: 0 },
    },
    rainfall: {
      total: rainfallTotal,
      dryDays: 20,
      maxDrySpell: 4,
      heavyRainDays: { '20': 1 },
      values: [rainfallTotal],
    },
    wind: {
      meanDays: { '8': 2 },
      gustDays: { '15': 1 },
    },
    freezeEvents: { lastSpringFreezeDoy: null, firstAutumnFreezeDoy: null },
  };
}

describe('aggregateIndicators', () => {
  const dataset = Array.from({ length: 10 }, (_, index) =>
    createYearIndicators(2010 + index, 100 + index * 10),
  );

  it('produit une synthèse sur 1 an', () => {
    const { stats } = aggregateIndicators(dataset.slice(-1));
    expect(stats.rainfallTotal).toEqual({
      mean: 190,
      stdev: 0,
      p10: 190,
      p50: 190,
      p90: 190,
    });
  });

  it('produit une synthèse sur 5 ans', () => {
    const { stats } = aggregateIndicators(dataset.slice(-5));
    expect(stats.rainfallTotal).toEqual({
      mean: 170,
      stdev: 15.81,
      p10: 154,
      p50: 170,
      p90: 186,
    });
  });

  it('produit une synthèse sur 10 ans', () => {
    const { stats } = aggregateIndicators(dataset);
    expect(stats.rainfallTotal).toEqual({
      mean: 145,
      stdev: 30.28,
      p10: 109,
      p50: 145,
      p90: 181,
    });
  });
});
