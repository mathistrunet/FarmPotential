const DEFAULT_OPTIONS = {
    gddBases: [5, 10],
    hddBases: [0],
    heatwaveThresholds: [
        { threshold: 30, minLength: 3 },
        { threshold: 32, minLength: 3 },
        { threshold: 35, minLength: 3 },
    ],
    dryDayThreshold: 1,
    heavyRainThresholds: [20, 30, 50],
    windMeanThresholds: [8, 10, 15],
    windGustThresholds: [15, 20, 25],
    springFreezeEndDoy: 200,
    autumnFreezeStartDoy: 213,
};
export function dayOfYear(date) {
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    const diff = date.getTime() - start;
    return Math.floor(diff / (24 * 60 * 60 * 1000));
}
export function sliceByPhase(obs, phaseStart, phaseEnd) {
    const byYear = new Map();
    for (const entry of obs) {
        const date = new Date(entry.ts);
        const year = date.getUTCFullYear();
        const doy = dayOfYear(date);
        const within = phaseStart <= phaseEnd
            ? doy >= phaseStart && doy <= phaseEnd
            : doy >= phaseStart || doy <= phaseEnd;
        if (!within)
            continue;
        const arr = byYear.get(year) ?? [];
        arr.push(entry);
        byYear.set(year, arr);
    }
    return [...byYear.entries()]
        .map(([year, values]) => ({ year, obs: values.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()) }))
        .sort((a, b) => a.year - b.year);
}
function averageTemperature(obs) {
    if (typeof obs.t === 'number' && Number.isFinite(obs.t))
        return obs.t;
    if (typeof obs.tmin === 'number' && typeof obs.tmax === 'number') {
        if (Number.isFinite(obs.tmin) && Number.isFinite(obs.tmax)) {
            return (obs.tmin + obs.tmax) / 2;
        }
    }
    return null;
}
function sumDegreeDays(entries, base, type) {
    let sum = 0;
    for (const entry of entries) {
        const avg = averageTemperature(entry);
        if (avg == null)
            continue;
        const delta = type === 'gdd' ? avg - base : base - avg;
        if (delta > 0) {
            sum += delta;
        }
    }
    return Number(sum.toFixed(2));
}
export function maxRun(values) {
    let max = 0;
    let current = 0;
    for (const value of values) {
        if (value) {
            current += 1;
            if (current > max)
                max = current;
        }
        else {
            current = 0;
        }
    }
    return max;
}
function countOccurrences(values, predicate) {
    return values.filter((value) => typeof value === 'number' && Number.isFinite(value)).filter(predicate).length;
}
export function computeHeatwaveStats(values, threshold, minLength) {
    let events = 0;
    let totalDays = 0;
    let longest = 0;
    let current = 0;
    for (const value of values) {
        if (typeof value === 'number' && value >= threshold) {
            current += 1;
        }
        else {
            if (current >= minLength) {
                events += 1;
                totalDays += current;
                if (current > longest)
                    longest = current;
            }
            current = 0;
        }
    }
    if (current >= minLength) {
        events += 1;
        totalDays += current;
        if (current > longest)
            longest = current;
    }
    return { events, totalDays, longest };
}
function computeFreezeEvents(entries, options) {
    let lastSpring = null;
    let firstAutumn = null;
    for (const entry of entries) {
        if (entry.tmin == null)
            continue;
        if (!Number.isFinite(entry.tmin))
            continue;
        const date = new Date(entry.ts);
        const doy = dayOfYear(date);
        if (entry.tmin <= 0 && doy <= options.springFreezeEndDoy) {
            lastSpring = doy;
        }
        if (entry.tmin <= 0 && doy >= options.autumnFreezeStartDoy && firstAutumn == null) {
            firstAutumn = doy;
        }
    }
    return { lastSpringFreezeDoy: lastSpring, firstAutumnFreezeDoy: firstAutumn };
}
export function indicatorsForSlice(slice, customOptions) {
    const options = { ...DEFAULT_OPTIONS, ...customOptions };
    const tmins = slice.obs.map((obs) => (typeof obs.tmin === 'number' && Number.isFinite(obs.tmin) ? obs.tmin : null));
    const tmaxs = slice.obs.map((obs) => (typeof obs.tmax === 'number' && Number.isFinite(obs.tmax) ? obs.tmax : null));
    const rains = slice.obs.map((obs) => (typeof obs.rr === 'number' && Number.isFinite(obs.rr) ? obs.rr : 0));
    const windMeans = slice.obs.map((obs) => (typeof obs.ff === 'number' && Number.isFinite(obs.ff) ? obs.ff : null));
    const windGusts = slice.obs.map((obs) => (typeof obs.fx === 'number' && Number.isFinite(obs.fx) ? obs.fx : null));
    const gdd = {};
    for (const base of options.gddBases) {
        gdd[`base${base}`] = sumDegreeDays(slice.obs, base, 'gdd');
    }
    const hdd = {};
    for (const base of options.hddBases) {
        hdd[`base${base}`] = sumDegreeDays(slice.obs, base, 'hdd');
    }
    const freezeDays = {
        le0: countOccurrences(tmins, (value) => value <= 0),
        leMinus2: countOccurrences(tmins, (value) => value <= -2),
        leMinus4: countOccurrences(tmins, (value) => value <= -4),
    };
    const heatDays = {
        ge30: countOccurrences(tmaxs, (value) => value >= 30),
        ge32: countOccurrences(tmaxs, (value) => value >= 32),
        ge35: countOccurrences(tmaxs, (value) => value >= 35),
    };
    const heatwavesEntries = {};
    for (const config of options.heatwaveThresholds) {
        heatwavesEntries[`ge${config.threshold}`] = computeHeatwaveStats(tmaxs, config.threshold, config.minLength);
    }
    const dryDays = rains.filter((value) => value < options.dryDayThreshold).length;
    const heavyRainDays = {};
    for (const threshold of options.heavyRainThresholds) {
        heavyRainDays[`ge${threshold}`] = rains.filter((value) => value >= threshold).length;
    }
    const windMeanDays = {};
    for (const threshold of options.windMeanThresholds) {
        windMeanDays[`ge${threshold}`] = windMeans.filter((value) => value != null && value >= threshold).length;
    }
    const windGustDays = {};
    for (const threshold of options.windGustThresholds) {
        windGustDays[`ge${threshold}`] = windGusts.filter((value) => value != null && value >= threshold).length;
    }
    const freezeEvents = computeFreezeEvents(slice.obs, options);
    return {
        year: slice.year,
        gdd,
        hdd,
        freezeDays,
        heatDays,
        heatwaves: heatwavesEntries,
        rainfall: {
            total: Number(rains.reduce((acc, value) => acc + value, 0).toFixed(2)),
            dryDays,
            maxDrySpell: maxRun(rains.map((value) => value < options.dryDayThreshold)),
            heavyRainDays,
            values: rains,
        },
        wind: {
            meanDays: windMeanDays,
            gustDays: windGustDays,
        },
        freezeEvents,
    };
}
export function computeStatistics(values) {
    const filtered = values.filter((value) => Number.isFinite(value));
    if (!filtered.length) {
        return { mean: null, stdev: null, p10: null, p50: null, p90: null };
    }
    const mean = filtered.reduce((acc, value) => acc + value, 0) / filtered.length;
    const variance = filtered.length > 1
        ? filtered.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (filtered.length - 1)
        : 0;
    const sorted = [...filtered].sort((a, b) => a - b);
    const quantile = (q) => {
        const pos = (sorted.length - 1) * q;
        const base = Math.floor(pos);
        const rest = pos - base;
        if (sorted[base + 1] !== undefined) {
            return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        }
        return sorted[base];
    };
    return {
        mean: Number(mean.toFixed(2)),
        stdev: Number(Math.sqrt(variance).toFixed(2)),
        p10: Number(quantile(0.1).toFixed(2)),
        p50: Number(quantile(0.5).toFixed(2)),
        p90: Number(quantile(0.9).toFixed(2)),
    };
}
export function aggregateIndicators(years) {
    const gddKeys = new Set();
    const hddKeys = new Set();
    const heavyRainKeys = new Set();
    const windMeanKeys = new Set();
    const windGustKeys = new Set();
    years.forEach((entry) => {
        Object.keys(entry.gdd).forEach((key) => gddKeys.add(key));
        Object.keys(entry.hdd).forEach((key) => hddKeys.add(key));
        Object.keys(entry.rainfall.heavyRainDays).forEach((key) => heavyRainKeys.add(key));
        Object.keys(entry.wind.meanDays).forEach((key) => windMeanKeys.add(key));
        Object.keys(entry.wind.gustDays).forEach((key) => windGustKeys.add(key));
    });
    const gddStats = {};
    gddKeys.forEach((key) => {
        gddStats[key] = computeStatistics(years.map((entry) => entry.gdd[key] ?? NaN));
    });
    const hddStats = {};
    hddKeys.forEach((key) => {
        hddStats[key] = computeStatistics(years.map((entry) => entry.hdd[key] ?? NaN));
    });
    const heavyRainStats = {};
    heavyRainKeys.forEach((key) => {
        heavyRainStats[key] = computeStatistics(years.map((entry) => entry.rainfall.heavyRainDays[key] ?? NaN));
    });
    const windMeanStats = {};
    windMeanKeys.forEach((key) => {
        windMeanStats[key] = computeStatistics(years.map((entry) => entry.wind.meanDays[key] ?? NaN));
    });
    const windGustStats = {};
    windGustKeys.forEach((key) => {
        windGustStats[key] = computeStatistics(years.map((entry) => entry.wind.gustDays[key] ?? NaN));
    });
    return {
        years,
        stats: {
            gdd: gddStats,
            hdd: hddStats,
            rainfallTotal: computeStatistics(years.map((entry) => entry.rainfall.total)),
            dryDays: computeStatistics(years.map((entry) => entry.rainfall.dryDays)),
            maxDrySpell: computeStatistics(years.map((entry) => entry.rainfall.maxDrySpell)),
            heavyRainDays: heavyRainStats,
            freezeDays: {
                le0: computeStatistics(years.map((entry) => entry.freezeDays.le0)),
                leMinus2: computeStatistics(years.map((entry) => entry.freezeDays.leMinus2)),
                leMinus4: computeStatistics(years.map((entry) => entry.freezeDays.leMinus4)),
            },
            heatDays: {
                ge30: computeStatistics(years.map((entry) => entry.heatDays.ge30)),
                ge32: computeStatistics(years.map((entry) => entry.heatDays.ge32)),
                ge35: computeStatistics(years.map((entry) => entry.heatDays.ge35)),
            },
            windMeanDays: windMeanStats,
            windGustDays: windGustStats,
        },
    };
}
