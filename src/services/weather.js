const API_URL = "https://archive-api.open-meteo.com/v1/archive";
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 18;

const MONTH_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function normalizeDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date)) {
    return null;
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function computeMonthlyAggregates() {
  return Array.from({ length: 12 }, () => ({
    dayTempSum: 0,
    dayCount: 0,
    nightTempSum: 0,
    nightCount: 0,
    humiditySum: 0,
    humidityCount: 0,
    windSum: 0,
    windCount: 0,
    precipitationSum: 0,
    precipitationCount: 0,
  }));
}

export function aggregateWeatherDataset(rawData, { startDate, endDate } = {}) {
  const hourly = rawData?.hourly || {};
  const daily = rawData?.daily || {};

  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const temps = Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m : [];
  const humidities = Array.isArray(hourly.relativehumidity_2m)
    ? hourly.relativehumidity_2m
    : [];
  const winds = Array.isArray(hourly.windspeed_10m) ? hourly.windspeed_10m : [];

  const dailyTimes = Array.isArray(daily.time) ? daily.time : [];
  const precipitations = Array.isArray(daily.precipitation_sum)
    ? daily.precipitation_sum
    : [];

  const monthly = computeMonthlyAggregates();

  let dayTempSum = 0;
  let dayCount = 0;
  let nightTempSum = 0;
  let nightCount = 0;
  let humiditySum = 0;
  let humidityCount = 0;
  let windSum = 0;
  let windCount = 0;
  let precipitationSum = 0;
  let precipitationCount = 0;

  for (let i = 0; i < times.length; i++) {
    const timeString = times[i];
    const dt = timeString ? new Date(timeString) : null;
    if (!dt || Number.isNaN(dt)) continue;

    const month = dt.getMonth();
    const hour = dt.getHours();

    const temp = toNumber(temps[i]);
    if (temp != null) {
      if (hour >= DAY_START_HOUR && hour < DAY_END_HOUR) {
        dayTempSum += temp;
        dayCount += 1;
        monthly[month].dayTempSum += temp;
        monthly[month].dayCount += 1;
      } else {
        nightTempSum += temp;
        nightCount += 1;
        monthly[month].nightTempSum += temp;
        monthly[month].nightCount += 1;
      }
    }

    const humidity = toNumber(humidities[i]);
    if (humidity != null) {
      humiditySum += humidity;
      humidityCount += 1;
      monthly[month].humiditySum += humidity;
      monthly[month].humidityCount += 1;
    }

    const wind = toNumber(winds[i]);
    if (wind != null) {
      windSum += wind;
      windCount += 1;
      monthly[month].windSum += wind;
      monthly[month].windCount += 1;
    }
  }

  for (let i = 0; i < dailyTimes.length; i++) {
    const timeString = dailyTimes[i];
    const dt = timeString ? new Date(timeString) : null;
    if (!dt || Number.isNaN(dt)) continue;

    const month = dt.getMonth();
    const precipitation = toNumber(precipitations[i]);
    if (precipitation != null) {
      precipitationSum += precipitation;
      precipitationCount += 1;
      monthly[month].precipitationSum += precipitation;
      monthly[month].precipitationCount += 1;
    }
  }

  const summary = {
    avgDayTemp: dayCount ? dayTempSum / dayCount : null,
    avgNightTemp: nightCount ? nightTempSum / nightCount : null,
    avgHumidity: humidityCount ? humiditySum / humidityCount : null,
    avgWindSpeed: windCount ? windSum / windCount : null,
    totalPrecipitation: precipitationSum,
    daySampleCount: dayCount,
    nightSampleCount: nightCount,
    humiditySampleCount: humidityCount,
    windSampleCount: windCount,
    precipitationDayCount: precipitationCount,
  };

  const monthlyAggregates = monthly
    .map((month, idx) => {
      const hasData =
        month.dayCount ||
        month.nightCount ||
        month.humidityCount ||
        month.windCount ||
        month.precipitationCount;
      return {
        monthIndex: idx,
        label: MONTH_LABELS[idx],
        avgDayTemp: month.dayCount ? month.dayTempSum / month.dayCount : null,
        avgNightTemp: month.nightCount ? month.nightTempSum / month.nightCount : null,
        avgHumidity: month.humidityCount ? month.humiditySum / month.humidityCount : null,
        avgWindSpeed: month.windCount ? month.windSum / month.windCount : null,
        totalPrecipitation: month.precipitationSum || 0,
        precipitationDayCount: month.precipitationCount,
        hasData,
      };
    })
    .filter((entry) => entry.hasData);

  const metadata = {
    startDate: startDate || null,
    endDate: endDate || null,
    timezone: rawData?.timezone ?? null,
    timezoneAbbreviation: rawData?.timezone_abbreviation ?? null,
    latitude: typeof rawData?.latitude === "number" ? rawData.latitude : null,
    longitude: typeof rawData?.longitude === "number" ? rawData.longitude : null,
    elevation: typeof rawData?.elevation === "number" ? rawData.elevation : null,
    hourlySampleCount: dayCount + nightCount,
    source: "Open-Meteo (archive)",
  };

  return { summary, monthly: monthlyAggregates, metadata };
}

export async function fetchWeatherSummary({
  latitude,
  longitude,
  startDate,
  endDate,
  signal,
} = {}) {
  const latNum = toNumber(latitude);
  const lonNum = toNumber(longitude);

  if (latNum == null || lonNum == null) {
    throw new Error("Coordonnées invalides pour la requête météo.");
  }

  const endRaw = endDate ? normalizeDate(new Date(endDate)) : normalizeDate(new Date());
  if (!endRaw) {
    throw new Error("Date de fin invalide pour la requête météo.");
  }

  const startRaw = startDate
    ? normalizeDate(new Date(startDate))
    : normalizeDate(new Date(endRaw.getTime() - 365 * DAY_IN_MS));

  if (!startRaw) {
    throw new Error("Date de début invalide pour la requête météo.");
  }

  if (startRaw > endRaw) {
    throw new Error("La date de début doit être antérieure à la date de fin.");
  }

  const params = new URLSearchParams({
    latitude: latNum.toFixed(4),
    longitude: lonNum.toFixed(4),
    start_date: toISODate(startRaw),
    end_date: toISODate(endRaw),
    hourly: "temperature_2m,relativehumidity_2m,windspeed_10m",
    daily: "precipitation_sum",
    timezone: "auto",
  });

  const response = await fetch(`${API_URL}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(
      `Impossible de récupérer les données météo (code ${response.status}).`
    );
  }

  const json = await response.json();
  if (json?.error) {
    throw new Error(json?.reason || "Le service météo a retourné une erreur.");
  }

  const aggregates = aggregateWeatherDataset(json, {
    startDate: toISODate(startRaw),
    endDate: toISODate(endRaw),
  });

  return {
    ...aggregates,
    metadata: {
      ...aggregates.metadata,
      query: { latitude: latNum, longitude: lonNum },
    },
  };
}

export default fetchWeatherSummary;
