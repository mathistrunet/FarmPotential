# Telepac Mapper

Telepac Mapper is a small React application for viewing and editing agricultural parcels on top of an interactive map. It can import and export parcels in the Télépac XML format and display raster layers such as OpenStreetMap, OpenTopoMap and optional IGN layers.

## Features
- Draw, edit and delete parcel polygons on a MapLibre map.
- Import existing parcels from a Télépac XML file and export your edits back to XML.
- Toggle various raster layers and overlays (OpenStreetMap, OpenTopoMap, IGN).
- Load RPG (Registre Parcellaire Graphique) data for the map's current extent.

## Getting started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development servers (client + weather API):
   ```bash
   npm run dev
   ```
   This command now launches both the Vite client and the local weather API concurrently. The app is served at [http://localhost:5173](http://localhost:5173) and the API listens on `http://localhost:3001`.

## Building
Create a production build in `dist/`:
```bash
npm run build
```
Preview the built app locally:
```bash
npm run preview
```

## IGN API key
Some raster layers (e.g. IGN plan and ortho imagery) require an API key. Obtain a key from [IGN Geoservices](https://geoservices.ign.fr/) and set it in `src/config/rasterLayers.js`:
```js
const YOUR_IGN_KEY = "your-ign-key";
```
Without a key, only open data layers such as OpenStreetMap will be available.

## Linting
Run ESLint on the project with:
```bash
npm run lint
```

## Données climat SAFRAN

Le monorepo inclut désormais un worker Python (`workers/safran`) capable de télécharger, agréger et enrichir les mailles SAFRAN avec des indicateurs agroclimatiques (GDD, ETP FAO-56, bilan hydrique journalier). Les exports (CSV ou Parquet) peuvent ensuite être ingérés par le backend pour alimenter l'API et le frontend.

### Variables utilisées

Les fichiers NetCDF SAFRAN doivent contenir les variables suivantes :

| Variable | Description | Unité |
| --- | --- | --- |
| `T2m` | Température de l'air à 2 m | Kelvin (converti en °C) |
| `RR` | Précipitations | kg·m⁻² (équivalent mm) |
| `RH` | Humidité relative | % |
| `SWdown` | Rayonnement global incident | W·m⁻² |
| `Wind` | Vent à 10 m | m·s⁻¹ |
| `Nebulosity` | Nébulosité (fraction ciel couvert) | 0-1 |

### Hypothèses agroclimatiques

* **GDD** : base paramétrable via `SAFRAN_GDD_BASE` (10°C par défaut).
* **ETP FAO-56** : pression atmosphérique estimée à partir de l'altitude (`SAFRAN_ALTITUDE_M`, 200 m par défaut). Albédo fixé à 0,23 (`SAFRAN_ALBEDO`). Rayonnement net calculé à partir de `SWdown` sans rayonnement long descendant.
* **Bilan hydrique** : réserve utile maximale `SAFRAN_SOIL_STORAGE_MM` (150 mm par défaut). L'ETR correspond au minimum entre l'ETP et l'eau disponible dans le réservoir.

Ces paramètres sont exposés via les variables d'environnement et détaillés dans `docs/safran-demo.md`.
