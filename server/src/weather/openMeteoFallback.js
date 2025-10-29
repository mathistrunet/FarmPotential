import fetch from 'node-fetch';
import { toNumber } from './infoclimatShared.js';
const OPEN_METEO_ARCHIVE_URL = process.env.OPEN_METEO_ARCHIVE_URL ?? 'https://archive-api.open-meteo.com/v1/archive';
function formatDate(dateISO) {
    const date = new Date(dateISO);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
function convertKmHToMs(value) {
    const numeric = toNumber(value);
    if (numeric == null)
        return null;
    return Number((numeric / 3.6).toFixed(2));
}
export async function fetchOpenMeteoObservations(latitude, longitude, startISO, endISO) {
    const startDate = formatDate(startISO);
    const endDate = formatDate(endISO);
    if (!startDate || !endDate) {
        return [];
    }
    try {
        const url = new URL(OPEN_METEO_ARCHIVE_URL);
        url.searchParams.set('latitude', latitude.toFixed(4));
        url.searchParams.set('longitude', longitude.toFixed(4));
        url.searchParams.set('start_date', startDate);
        url.searchParams.set('end_date', endDate);
        url.searchParams.set('timezone', 'UTC');
        url.searchParams.set('hourly', 'temperature_2m,relativehumidity_2m,windspeed_10m,windgusts_10m,pressure_msl,precipitation');
        url.searchParams.set('daily', 'precipitation_sum,temperature_2m_min,temperature_2m_max');
        const response = await fetch(url.toString());
        if (!response.ok) {
            return [];
        }
        const payload = (await response.json());
        const hourlyTimes = Array.isArray(payload.hourly?.time) ? payload.hourly?.time ?? [] : [];
        const hourlyTemperature = Array.isArray(payload.hourly?.temperature_2m)
            ? payload.hourly?.temperature_2m ?? []
            : [];
        const hourlyHumidity = Array.isArray(payload.hourly?.relativehumidity_2m)
            ? payload.hourly?.relativehumidity_2m ?? []
            : [];
        const hourlyWind = Array.isArray(payload.hourly?.windspeed_10m)
            ? payload.hourly?.windspeed_10m ?? []
            : [];
        const hourlyGust = Array.isArray(payload.hourly?.windgusts_10m)
            ? payload.hourly?.windgusts_10m ?? []
            : [];
        const hourlyPressure = Array.isArray(payload.hourly?.pressure_msl)
            ? payload.hourly?.pressure_msl ?? []
            : [];
        const hourlyPrecipitation = Array.isArray(payload.hourly?.precipitation)
            ? payload.hourly?.precipitation ?? []
            : [];
        const dailyTimes = Array.isArray(payload.daily?.time) ? payload.daily?.time ?? [] : [];
        const dailyPrecipitation = Array.isArray(payload.daily?.precipitation_sum)
            ? payload.daily?.precipitation_sum ?? []
            : [];
        const dailyMinTemp = Array.isArray(payload.daily?.temperature_2m_min)
            ? payload.daily?.temperature_2m_min ?? []
            : [];
        const dailyMaxTemp = Array.isArray(payload.daily?.temperature_2m_max)
            ? payload.daily?.temperature_2m_max ?? []
            : [];
        const dailyPrecipitationMap = new Map();
        const dailyMinMap = new Map();
        const dailyMaxMap = new Map();
        dailyTimes.forEach((day, index) => {
            const key = formatDate(day);
            if (!key)
                return;
            const precipitation = toNumber(dailyPrecipitation[index]);
            if (precipitation != null) {
                dailyPrecipitationMap.set(key, Number(precipitation.toFixed(2)));
            }
            const minTemp = toNumber(dailyMinTemp[index]);
            if (minTemp != null) {
                dailyMinMap.set(key, Number(minTemp.toFixed(2)));
            }
            const maxTemp = toNumber(dailyMaxTemp[index]);
            if (maxTemp != null) {
                dailyMaxMap.set(key, Number(maxTemp.toFixed(2)));
            }
        });
        const observations = [];
        for (let i = 0; i < hourlyTimes.length; i += 1) {
            const ts = hourlyTimes[i];
            if (typeof ts !== 'string' || !ts)
                continue;
            const date = new Date(ts);
            if (Number.isNaN(date.getTime()))
                continue;
            const dayKey = formatDate(date.toISOString());
            const observation = {
                ts: date.toISOString(),
                t: toNumber(hourlyTemperature[i]),
                tmin: dayKey ? dailyMinMap.get(dayKey) ?? null : null,
                tmax: dayKey ? dailyMaxMap.get(dayKey) ?? null : null,
                rr: toNumber(hourlyPrecipitation[i]),
                rr24: dayKey ? dailyPrecipitationMap.get(dayKey) ?? null : null,
                ff: convertKmHToMs(hourlyWind[i]),
                fx: convertKmHToMs(hourlyGust[i]),
                rh: toNumber(hourlyHumidity[i]),
                p: toNumber(hourlyPressure[i]),
            };
            observations.push(observation);
        }
        return observations;
    }
    catch (error) {
        console.warn('Unable to fetch Open-Meteo fallback data:', error);
        return [];
    }
}
