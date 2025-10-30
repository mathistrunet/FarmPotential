import express from 'express';
import { ZodError } from 'zod';
import { findNearestStations, getAllStations, refreshStations, } from './stations.js';
import { getObservationsForStation } from './infoclimatClient.js';
import { mergeStationsObservations } from './observations.js';
import { fetchOpenMeteoObservations } from './openMeteoFallback.js';
import { buildWeatherSummary } from './summary.js';
import { AnalyzeWeatherSchema } from './schemas.js';
import { fetchInfoclimatRange } from './infoclimat.js';
export const router = express.Router();
function parseMaxYears(query) {
    if (query.maxYears == null)
        return 10;
    const parsed = Number(query.maxYears);
    if (!Number.isFinite(parsed))
        return 10;
    const clamped = Math.min(Math.max(Math.round(parsed), 1), 50);
    return clamped;
}
router.get('/availability', async (req, res, next) => {
    try {
        const lat = Number(req.query.lat);
        const lon = Number(req.query.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            res.status(400).json({ error: 'Paramètres lat/lon invalides.' });
            return;
        }
        const maxYears = parseMaxYears(req.query);
        const stations = await findNearestStations(lat, lon, 1);
        if (!stations.length) {
            res.status(404).json({ error: 'Aucune station météo disponible pour cette localisation.' });
            return;
        }
        const now = new Date();
        const endYear = now.getUTCFullYear();
        const startYear = Math.max(1900, endYear - maxYears + 1);
        const startISO = new Date(Date.UTC(startYear, 0, 1)).toISOString();
        const endISO = new Date(Date.UTC(endYear, 11, 31, 23, 59, 59)).toISOString();
        let availability;
        try {
            availability = await Promise.all(stations.map(async (station) => {
                const observations = await getObservationsForStation(station.id, startISO, endISO);
                const yearsSet = new Set();
                for (const obs of observations) {
                    const year = new Date(obs.ts).getUTCFullYear();
                    if (Number.isFinite(year)) {
                        yearsSet.add(year);
                    }
                }
                const availableYears = Array.from(yearsSet).sort((a, b) => a - b);
                return { ...station, availableYears };
            }));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error ?? '');
            if (/INFOCLIMAT_API_KEY/i.test(message ?? '')) {
                res.status(502).json({ error: "Impossible de contacter l'API Infoclimat : configurez la variable d'environnement INFOCLIMAT_API_KEY." });
                return;
            }
            res.status(502).json({ error: 'Impossible de récupérer les observations Infoclimat pour estimer la disponibilité.' });
            return;
        }
        res.json({
            stations: availability,
            startYear,
            endYear,
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/analyze', async (req, res) => {
    try {
        const { station: requestedStation, dateStart, dateEnd, source } = AnalyzeWeatherSchema.parse(req.query);
        const station = requestedStation ?? '07015';
        const data = await fetchInfoclimatRange(station, dateStart, dateEnd);
        const hourly = data?.hourly?.[station] ?? [];
        res.json({
            source,
            station,
            dateStart,
            dateEnd,
            stations: data?.stations ?? [],
            metadata: data?.metadata ?? null,
            hourly,
        });
    }
    catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: 'Invalid request', details: error.errors });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Weather analyze failed' });
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
        const fetchErrors = [];
        const observationsByStation = await Promise.all(stations.map(async (station) => {
            try {
                return await getObservationsForStation(station.id, startISO, endISO);
            }
            catch (error) {
                const normalizedError = error instanceof Error ? error : new Error(String(error));
                fetchErrors.push(normalizedError);
                console.warn(`Unable to load Infoclimat observations for station ${station.id}:`, normalizedError);
                return [];
            }
        }));
        let merged = mergeStationsObservations(stations, observationsByStation, lat, lon);
        let summaryStations = stations;
        let source = 'Infoclimat (Open Data)';
        if (!merged.length) {
            const fallback = await fetchOpenMeteoObservations(lat, lon, startISO, endISO);
            if (fallback.length) {
                merged = fallback;
                summaryStations = [
                    {
                        id: 'open-meteo-grid',
                        name: 'Open-Meteo (grille)',
                        city: null,
                        lat,
                        lon,
                        altitude: null,
                        type: 'grid',
                        distanceKm: 0,
                    },
                ];
                source = 'Open-Meteo (Archive API – fallback)';
            }
        }
        if (!merged.length) {
            if (fetchErrors.length) {
                const missingKey = fetchErrors.some((error) => /INFOCLIMAT_API_KEY/i.test(error.message ?? ''));
                const message = missingKey
                    ? "Impossible de contacter l'API Infoclimat : configurez la variable d'environnement INFOCLIMAT_API_KEY."
                    : "Impossible de récupérer les observations Infoclimat pour la période demandée.";
                res.status(502).json({ error: message });
            }
            else {
                res.status(404).json({ error: "Aucune observation disponible pour l'année demandée." });
            }
            return;
        }
        const summary = buildWeatherSummary(merged, {
            startISO,
            endISO,
            latitude: lat,
            longitude: lon,
            stations: summaryStations,
            source,
        });
        res.json(summary);
    }
    catch (error) {
        next(error);
    }
});
router.get('/stations', async (req, res, next) => {
    try {
        if (req.query.refresh) {
            try {
                await refreshStations();
            }
            catch (error) {
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
    }
    catch (error) {
        next(error);
    }
});
export default router;
