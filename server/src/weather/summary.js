import { MONTH_LABELS } from './summaryConstants.js';
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 18;
function createMonthlyAccumulator() {
    return {
        dayTempSum: 0,
        dayCount: 0,
        nightTempSum: 0,
        nightCount: 0,
        humiditySum: 0,
        humidityCount: 0,
        windSum: 0,
        windCount: 0,
        precipitationSum: 0,
        precipitationDays: new Set(),
    };
}
function ensureInRange(obs, startMs, endMs) {
    const date = new Date(obs.ts);
    if (Number.isNaN(date.getTime()))
        return null;
    const ts = date.getTime();
    if (ts < startMs || ts > endMs) {
        return null;
    }
    return date;
}
export function buildWeatherSummary(observations, options) {
    const startMs = new Date(options.startISO).getTime();
    const endMs = new Date(options.endISO).getTime();
    const monthly = Array.from({ length: 12 }, createMonthlyAccumulator);
    let dayTempSum = 0;
    let dayCount = 0;
    let nightTempSum = 0;
    let nightCount = 0;
    let humiditySum = 0;
    let humidityCount = 0;
    let windSum = 0;
    let windCount = 0;
    let precipitationSum = 0;
    const precipitationDays = new Set();
    observations.forEach((obs) => {
        if (!obs || typeof obs.ts !== 'string') {
            return;
        }
        const date = ensureInRange(obs, startMs, endMs);
        if (!date)
            return;
        const month = date.getUTCMonth();
        const hour = date.getUTCHours();
        const dayKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
        const bucket = monthly[month];
        if (!bucket) {
            return;
        }
        if (typeof obs.t === 'number' && Number.isFinite(obs.t)) {
            if (hour >= DAY_START_HOUR && hour < DAY_END_HOUR) {
                dayTempSum += obs.t;
                dayCount += 1;
                bucket.dayTempSum += obs.t;
                bucket.dayCount += 1;
            }
            else {
                nightTempSum += obs.t;
                nightCount += 1;
                bucket.nightTempSum += obs.t;
                bucket.nightCount += 1;
            }
        }
        if (typeof obs.rh === 'number' && Number.isFinite(obs.rh)) {
            humiditySum += obs.rh;
            humidityCount += 1;
            bucket.humiditySum += obs.rh;
            bucket.humidityCount += 1;
        }
        if (typeof obs.ff === 'number' && Number.isFinite(obs.ff)) {
            windSum += obs.ff;
            windCount += 1;
            bucket.windSum += obs.ff;
            bucket.windCount += 1;
        }
        const precipitation = typeof obs.rr === 'number' && Number.isFinite(obs.rr)
            ? obs.rr
            : typeof obs.rr24 === 'number' && Number.isFinite(obs.rr24)
                ? obs.rr24
                : null;
        if (precipitation != null && precipitation > 0) {
            precipitationSum += precipitation;
            precipitationDays.add(dayKey);
            bucket.precipitationSum += precipitation;
            bucket.precipitationDays.add(dayKey);
        }
    });
    const summary = {
        avgDayTemp: dayCount ? Number((dayTempSum / dayCount).toFixed(2)) : null,
        avgNightTemp: nightCount ? Number((nightTempSum / nightCount).toFixed(2)) : null,
        avgHumidity: humidityCount ? Number((humiditySum / humidityCount).toFixed(2)) : null,
        avgWindSpeed: windCount ? Number((windSum / windCount).toFixed(2)) : null,
        totalPrecipitation: Number(precipitationSum.toFixed(2)),
        daySampleCount: dayCount,
        nightSampleCount: nightCount,
        humiditySampleCount: humidityCount,
        windSampleCount: windCount,
        precipitationDayCount: precipitationDays.size,
    };
    const monthlyAggregates = monthly
        .map((bucket, index) => {
        const precipitationDayCount = bucket.precipitationDays.size;
        const hasData = bucket.dayCount > 0 ||
            bucket.nightCount > 0 ||
            bucket.humidityCount > 0 ||
            bucket.windCount > 0 ||
            precipitationDayCount > 0;
        return {
            monthIndex: index,
            label: MONTH_LABELS[index] ?? `Mois ${index + 1}`,
            avgDayTemp: bucket.dayCount ? Number((bucket.dayTempSum / bucket.dayCount).toFixed(2)) : null,
            avgNightTemp: bucket.nightCount ? Number((bucket.nightTempSum / bucket.nightCount).toFixed(2)) : null,
            avgHumidity: bucket.humidityCount ? Number((bucket.humiditySum / bucket.humidityCount).toFixed(2)) : null,
            avgWindSpeed: bucket.windCount ? Number((bucket.windSum / bucket.windCount).toFixed(2)) : null,
            totalPrecipitation: Number(bucket.precipitationSum.toFixed(2)),
            precipitationDayCount,
            hasData,
        };
    })
        .filter((entry) => entry.hasData);
    return {
        summary,
        monthly: monthlyAggregates,
        metadata: {
            startDate: options.startISO,
            endDate: options.endISO,
            latitude: options.latitude,
            longitude: options.longitude,
            hourlySampleCount: dayCount + nightCount,
            source: options.source ?? 'Infoclimat (Open Data)',
            stationsUsed: options.stations.map((station) => ({
                id: station.id,
                name: station.name,
                city: station.city,
                distanceKm: station.distanceKm ?? null,
                altitude: station.altitude,
                type: station.type,
            })),
        },
    };
}
