import { describe, it, expect } from 'vitest';
import { empiricalProbability, quantile, linearTrend, mannKendall, trendDirection, computeConfidenceScore, } from './riskModels.js';
describe('empiricalProbability', () => {
    it('calcule la fréquence observée', () => {
        const result = empiricalProbability([0, 1, 2, 3, 4], (value) => value >= 3);
        expect(result.probability).toBeCloseTo(0.4, 5);
        expect(result.sampleSize).toBe(5);
        expect(result.occurrences).toBe(2);
    });
});
describe('quantile', () => {
    it('retourne la valeur médiane', () => {
        expect(quantile([1, 3, 5, 7, 9], 0.5)).toBe(5);
    });
});
describe('linearTrend et mannKendall', () => {
    it('détectent une tendance positive', () => {
        const years = Array.from({ length: 10 }, (_, idx) => 2010 + idx);
        const values = years.map((year) => year * 0.5 - 1000);
        const trend = linearTrend(years, values);
        expect(trend.slope).toBeGreaterThan(0);
        const mk = mannKendall(values);
        expect(mk.tau).toBeGreaterThan(0.9);
        expect(mk.pValue).toBeLessThan(0.05);
        expect(trendDirection(trend.slope)).toBe('↑');
    });
});
describe('computeConfidenceScore', () => {
    it('pondère les facteurs attendus', () => {
        const score = computeConfidenceScore({ nYears: 18, completeness: 0.9, interStationStd: 1.5 });
        expect(score).toBeGreaterThan(0.5);
        expect(score).toBeLessThanOrEqual(1);
    });
});
