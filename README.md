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
2. Start the development server:
   ```bash
   npm run dev
   ```
   The app is served at [http://localhost:5173](http://localhost:5173).

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
