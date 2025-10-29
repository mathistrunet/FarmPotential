import fetch from 'node-fetch';
export const INFOCLIMAT_API_KEY = process.env.INFOCLIMAT_API_KEY ?? '';
export const INFOCLIMAT_OBSERVATIONS_URL = process.env.INFOCLIMAT_API_BASE ?? 'https://www.infoclimat.fr/opendata/produits-stations.csv';
export const INFOCLIMAT_STATIONS_URL = process.env.INFOCLIMAT_STATIONS_URL ?? 'https://www.infoclimat.fr/opendata/stations.csv';
const MIN_REQUEST_INTERVAL_MS = Number(process.env.WEATHER_API_MIN_INTERVAL_MS ?? '900');
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
let lastRequestTimestamp = 0;
export function assertApiKey() {
    if (!INFOCLIMAT_API_KEY) {
        throw new Error('Missing INFOCLIMAT_API_KEY environment variable');
    }
}
export async function rateLimit() {
    const now = Date.now();
    const elapsed = now - lastRequestTimestamp;
    const wait = MIN_REQUEST_INTERVAL_MS - elapsed;
    if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastRequestTimestamp = Date.now();
}
export function toNumber(value) {
    if (value == null)
        return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').trim();
        if (!normalized)
            return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
export async function fetchCsv(url, options = {}) {
    const maxRetries = options.maxRetries ?? MAX_RETRIES;
    const baseDelay = options.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS;
    let attempt = 0;
    for (;;) {
        try {
            await rateLimit();
            const response = await fetch(url.toString(), {
                headers: { 'User-Agent': 'FarmPotential/WeatherAnalysis' },
            });
            if (!response.ok) {
                throw new Error(`Infoclimat API responded with status ${response.status}`);
            }
            return await response.text();
        }
        catch (error) {
            attempt += 1;
            if (attempt >= maxRetries) {
                throw error;
            }
            const delay = baseDelay * 2 ** (attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}
