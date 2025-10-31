# Module météo – API d'analyse agro-climatique

Ce dossier contient l'API Express en TypeScript qui expose les indicateurs et risques météo calculés à partir des données Infoclimat.

## Installation

```bash
npm install
```

## Variables d'environnement

| Variable | Description |
| --- | --- |
| `INFOCLIMAT_API_KEY` / `INFOCLIMAT_API_TOKEN` | Clé API Infoclimat (obligatoire pour interroger l'API Open Data). |
| `INFOCLIMAT_API_BASE` | (optionnel) URL de base de l'endpoint CSV Infoclimat. Valeur par défaut : `https://www.infoclimat.fr/opendata/produits-stations.csv`. |
| `INFOCLIMAT_STATIONS_URL` | (optionnel) URL CSV listant les métadonnées stations. Valeur par défaut : `https://www.infoclimat.fr/opendata/stations.csv`. |
| `WEATHER_CACHE_TTL_HOURS` | (optionnel) Durée de vie du cache des réponses API (heures). Par défaut : `24`. |
| `WEATHER_API_MIN_INTERVAL_MS` | (optionnel) Intervalle minimal entre deux requêtes externes en millisecondes pour respecter le rate limit (par défaut `900`). |
| `WEATHER_DB_PATH` | (optionnel) Chemin du fichier SQLite utilisé pour stocker les observations et le cache. Par défaut `./weather.sqlite`. |

## Lancer l'API

```bash
npm run server:dev
```

L'API écoute par défaut sur le port `3001` et expose les endpoints suivants :

- `GET /api/weather/analyze` : analyse agro-climatique multi-annuelle (indicateurs + risques).
- `GET /api/weather/summary` : synthèse annuelle (moyennes/jours de pluie) calculée à partir des observations Infoclimat.
- `GET /api/weather/stations` : liste des stations connues (cache SQLite ou snapshot), avec prise en charge d'un rafraîchissement via `?refresh=1`.

## Schéma des tables SQLite

- `stations`: métadonnées stations (id, nom, lat/lon, altitude, type).
- `observations`: observations horaires/quotidiennes normalisées (clé `station_id + ts`).
- `cache_requests`: cache JSON des réponses API pour éviter les appels redondants (TTL configurable).

## Flux de données

1. Recherche des 3 stations les plus proches via `stations.ts` (cache SQLite ou synchronisation Infoclimat).
2. Lecture des observations depuis le cache SQLite ou, si nécessaire, via l'API CSV Infoclimat (avec retry + rate limit).
3. Agrégation/normalisation (unités : °C, mm, m/s) et lissage par IDW simple entre stations.
4. Calcul des indicateurs agro-climatiques (`indicators.ts`) et des probabilités/tendances (`riskModels.ts`).
5. Réponse JSON typée (`schemas.ts`) avec attribution "Source : Infoclimat".

## Mapping des champs CSV → modèle

| Champ CSV Infoclimat | Champ interne |
| --- | --- |
| `date_iso` / `date` | `ts` (ISO UTC) |
| `t` / `temperature` | `t` (°C) |
| `tn` / `tmin` | `tmin` (°C) |
| `tx` / `tmax` | `tmax` (°C) |
| `rr`, `rr1h`, `precip` | `rr` (mm) |
| `rr24`, `precip24` | `rr24` (mm) |
| `ff`, `wind_avg` | `ff` (vent moyen m/s) |
| `fx`, `wind_gust` | `fx` (rafales m/s) |
| `humidity`, `rh` | `rh` (%) |
| `p`, `pressure` | `p` (hPa) |

## Limites connues

- La synchronisation automatique des stations dépend de l'accès à l'Open Data Infoclimat (`INFOCLIMAT_API_KEY` ou `INFOCLIMAT_API_TOKEN`). Un snapshot (`data/stations.json`) est utilisé en secours.
- L'endpoint Infoclimat exact dépend de l'offre Open Data disponible (adapter `INFOCLIMAT_API_BASE` si nécessaire).
- Le lissage IDW est volontairement simple et ne prend pas en compte l'altitude.
- Les données sont agrégées en heure locale supposée ~UTC ; adapter si un fuseau spécifique est requis.
- Prévoir un rafraîchissement du cache (cron) pour maintenir les historiques à jour.

_Source : Infoclimat (Open Data)._ 
