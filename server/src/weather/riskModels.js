export function empiricalProbability(values, predicate) {
    const filtered = values.filter((value) => value != null && Number.isFinite(value));
    if (!filtered.length) {
        return { probability: null, sampleSize: 0, occurrences: 0 };
    }
    const occurrences = filtered.filter(predicate).length;
    return { probability: occurrences / filtered.length, sampleSize: filtered.length, occurrences };
}
export function quantile(values, q) {
    if (q < 0 || q > 1)
        throw new Error('Quantile q must be between 0 and 1');
    const filtered = values.filter((value) => value != null && Number.isFinite(value));
    if (!filtered.length)
        return null;
    const sorted = [...filtered].sort((a, b) => a - b);
    const position = (sorted.length - 1) * q;
    const base = Math.floor(position);
    const rest = position - base;
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
}
export function probabilityBelowQuantile(values, threshold) {
    return empiricalProbability(values, (value) => value <= threshold);
}
export function probabilityAboveQuantile(values, threshold) {
    return empiricalProbability(values, (value) => value >= threshold);
}
export function linearTrend(xs, ys) {
    if (xs.length !== ys.length) {
        throw new Error('linearTrend requires arrays of the same length');
    }
    const points = [];
    for (let i = 0; i < xs.length; i += 1) {
        const y = ys[i];
        if (y == null || !Number.isFinite(y))
            continue;
        if (!Number.isFinite(xs[i]))
            continue;
        points.push({ x: xs[i], y });
    }
    if (points.length < 2)
        return null;
    const n = points.length;
    const sumX = points.reduce((acc, point) => acc + point.x, 0);
    const sumY = points.reduce((acc, point) => acc + point.y, 0);
    const sumXY = points.reduce((acc, point) => acc + point.x * point.y, 0);
    const sumXX = points.reduce((acc, point) => acc + point.x * point.x, 0);
    const denominator = n * sumXX - sumX ** 2;
    if (denominator === 0)
        return null;
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    const meanY = sumY / n;
    const totalVariance = points.reduce((acc, point) => acc + (point.y - meanY) ** 2, 0);
    const explainedVariance = points.reduce((acc, point) => acc + (slope * point.x + intercept - meanY) ** 2, 0);
    const r2 = totalVariance === 0 ? 0 : explainedVariance / totalVariance;
    return {
        slope: Number(slope.toFixed(4)),
        intercept: Number(intercept.toFixed(2)),
        r2: Number(r2.toFixed(3)),
    };
}
export function mannKendall(values) {
    const filtered = values.filter((value) => value != null && Number.isFinite(value));
    const n = filtered.length;
    if (n < 3)
        return null;
    let s = 0;
    for (let i = 0; i < n - 1; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
            const diff = filtered[j] - filtered[i];
            if (diff > 0)
                s += 1;
            else if (diff < 0)
                s -= 1;
        }
    }
    const variance = (n * (n - 1) * (2 * n + 5)) / 18;
    const z = s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0;
    const tau = s / (0.5 * n * (n - 1));
    const pValue = 2 * (1 - normalCdf(Math.abs(z)));
    return {
        tau: Number(tau.toFixed(3)),
        pValue: Number(pValue.toFixed(4)),
    };
}
function normalCdf(value) {
    return 0.5 * (1 + erf(value / Math.sqrt(2)));
}
function erf(x) {
    // Numerical approximation (Abramowitz and Stegun 7.1.26)
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1 / (1 + p * absX);
    const y = 1 -
        (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
    return sign * y;
}
export function trendDirection(slope, tolerance = 1e-3) {
    if (slope == null || !Number.isFinite(slope))
        return '→';
    if (slope > tolerance)
        return '↑';
    if (slope < -tolerance)
        return '↓';
    return '→';
}
export function computeConfidenceScore({ nYears, completeness, interStationStd }) {
    const yearsScore = Math.min(1, nYears / 20);
    const completenessScore = Math.min(1, Math.max(0, completeness));
    let coherenceScore = 1;
    if (interStationStd != null && Number.isFinite(interStationStd)) {
        const penalty = interStationStd / 5; // 5 units spread -> strong penalty
        coherenceScore = Math.max(0, 1 - penalty);
    }
    const weighted = yearsScore * 0.5 + completenessScore * 0.3 + coherenceScore * 0.2;
    return Number(Math.min(1, Math.max(0, weighted)).toFixed(2));
}
export function buildBinaryRisk(label, values, predicate) {
    return {
        label,
        probability: empiricalProbability(values, predicate),
    };
}
