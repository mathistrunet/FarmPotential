import { describe, it, expect } from 'vitest';
import { indicatorsForSlice, maxRun, computeHeatwaveStats, type YearSlice } from './indicators.js';
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
