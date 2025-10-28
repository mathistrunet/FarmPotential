# Module météo historique

Ce dossier décrit l'architecture du module "Météo historique" introduit pour FarmPotential (`telepac-mapper`). Il agrège plusieurs fournisseurs de données, applique un schéma normalisé et expose une API unique côté front.

## Aperçu

Le point d'entrée principal se situe dans `src/weather/index.ts`. La fonction `getWeather({ lat, lon, start, end, granularity, provider?, stationId? })` :

1. Sélectionne dynamiquement la source (Infoclimat puis Meteostat puis Open-Meteo) en fonction de la configuration et des erreurs éventuelles.
2. Met en cache les réponses normalisées (IndexedDB via localForage) pendant `VITE_WEATHER_TTL_HOURS` heures.
3. Applique un rate-limiter (token bucket) par fournisseur pour éviter le throttling.
4. Fusionne plusieurs fournisseurs si nécessaire (complément des champs manquants comme l'humidité ou le rayonnement).

Toutes les réponses sont converties vers les types décrits dans `src/weather/types.ts` :

- `WeatherPointHourly`
- `WeatherPointDaily`
- `WeatherSeries`

Les champs normalisés sont strictement documentés pour faciliter la consommation dans l'UI et dans les tests.

## Clés et configuration

```dotenv
VITE_INFOCLIMAT_TOKEN=
VITE_WEATHER_TTL_HOURS=24
# Optionnel :
# VITE_METEOSTAT_TOKEN=
```

- Si `VITE_INFOCLIMAT_TOKEN` est défini, `getWeather()` tente en priorité Infoclimat.
- `VITE_WEATHER_TTL_HOURS` pilote la durée de vie du cache (24h par défaut).
- `VITE_METEOSTAT_TOKEN` permet d'ajouter un header `x-api-key` pour Meteostat si vous disposez d'une clé.

⚠️ **Sécurité** : si les CGU Infoclimat interdisent d'exposer la clé côté client, utilisez un proxy serveur (ex. Cloud Functions) pour signer la requête, puis adaptez `fetchInfoclimat` pour cibler ce proxy (voir TODO ci-dessous).

## Infoclimat

- Adaptateur : `src/weather/providers/infoclimat.ts`
- TODO majeur : **`buildInfoclimatUrl()` doit être configurée selon l'endpoint Infoclimat exact** (`/historique` ou équivalent) et ses paramètres (`token`, `station`, `start`, `end`, `pas`, `format=json`, etc.).
- Gestion station : `findNearestStation()` sélectionne la station la plus proche via un catalogue préchargé (API `/api/weather/stations` puis fallback JSON local).
- Attribution par défaut : `Données © Infoclimat`.
- Gestion d'erreurs : 401/403/429 déclenchent un `WeatherProviderError` afin que la façade passe au fallback.

### Obtenir une clé Infoclimat

1. Créer un compte sur [https://www.infoclimat.fr](https://www.infoclimat.fr).
2. Demander un accès API (formulaire dédié aux développeurs).
3. Une fois la clé reçue, l'ajouter à votre `.env` : `VITE_INFOCLIMAT_TOKEN=...`.
4. Vérifier les CGU : certaines clauses imposent d'appeler l'API côté serveur.

## Meteostat

- Adaptateur : `src/weather/providers/meteostat.ts`.
- Endpoint suggéré : `https://meteostat.net/api/point/{hourly|daily}`.
- Paramètres : `lat`, `lon`, `start`, `end`. Ajout possible d'un header `x-api-key` (token optionnel).
- Attribution : `© Meteostat – meteostat.net`.
- Les unités Meteostat (°C, mm, m/s) sont déjà conformes au schéma normalisé.

## Open-Meteo (ERA5)

- Adaptateur : `src/weather/providers/openmeteo.ts`.
- Endpoint utilisé : `https://archive-api.open-meteo.com/v1/archive`.
- Variables horaire et journalière demandées : voir constantes `HOURLY_VARIABLES` et `DAILY_VARIABLES`.
- Attribution : `Données Open-Meteo / ERA5 reanalysis`.

## Cache et rate-limit

- `src/weather/cache.ts` : utilisation de `localforage` (IndexedDB dans le navigateur, fallback mémoire). Clé : `provider:lat:lon:start:end:granularity`.
- `src/weather/rateLimit.ts` : simple token bucket (5 req/s Infoclimat, 3 req/s Meteostat, 10 req/s Open-Meteo).
- Purge automatique des entrées expirées (TTL configurable).

## Stations

- `src/weather/stations.ts` : calcule la distance Haversine et recherche la station la plus proche.
- Charge d'abord `/api/weather/stations?provider=...`, sinon fallback `public/data/weather-stations-fr.json`.
- `clearStationsCache()` permet d'invalider manuellement les catalogues.

## Tests

- Les fixtures se trouvent dans `tests/weather/__fixtures__`.
- Les tests unitaires (`tests/weather/*.test.ts`) valident la normalisation de chaque fournisseur et l'intégration de la façade.

## Intégration UI

- Le panneau React "Météo" consomme `getWeather()` et affiche :
  - Un formulaire (lat/lon, plage de dates, granularité, fournisseur).
  - Un tableau + graphiques (Recharts) pour les séries journalières/horaire.
  - Un badge d'attribution/mention licence.
- Mode "lier à la parcelle" : clic sur une parcelle → centroïde injecté dans le formulaire.

## TODO / évolutions

- [ ] Finaliser `buildInfoclimatUrl()` selon la documentation officielle (paramètre `&type=...`, gestion pagination >365 jours, timezone).
- [ ] Ajouter un proxy sécurisé côté serveur si la clé Infoclimat ne doit pas transiter côté client.
- [ ] Ajouter une persistance serveur des stations pour éviter le chargement d'un gros JSON côté client.
- [ ] Collecter automatiquement des métadonnées de licence supplémentaires (Creative Commons, etc.).
