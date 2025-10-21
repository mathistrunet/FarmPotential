# Telepac Mapper

Telepac Mapper is a small React application for viewing and editing agricultural parcels on top of an interactive map. It can import and export parcels in the Télépac XML format and display raster layers such as OpenStreetMap, OpenTopoMap and optional IGN layers.

## Features
- Draw, edit and delete parcel polygons on a MapLibre map.
- Import existing parcels from a Télépac XML file and export your edits back to XML.
- Toggle various raster layers and overlays (OpenStreetMap, OpenTopoMap, IGN).
- Load RPG (Registre Parcellaire Graphique) data for the map's current extent.

## Guide d'installation pour une utilisation locale

1. **Prérequis**
   - [Node.js](https://nodejs.org/) (version LTS recommandée) et `npm` installés sur votre machine.
   - L'accès à un terminal (macOS/Linux) ou PowerShell (Windows).

2. **Cloner le dépôt**
   ```bash
   git clone https://github.com/<votre-compte>/FarmPotential.git
   cd FarmPotential
   ```

3. **Installer les dépendances**
   ```bash
   npm install
   ```

4. **Configurer la clé API IGN (optionnel)**
   - Certaines couches cartographiques nécessitent une clé API IGN.
   - Ouvrez `src/config/rasterLayers.js` et remplacez la valeur de `YOUR_IGN_KEY` par votre clé.

5. **Démarrer le serveur de développement**
   ```bash
   npm run dev
   ```
   L'application est accessible sur [http://localhost:5173](http://localhost:5173).

6. **Construire une version de production (facultatif)**
   ```bash
   npm run build
   ```
   Pour prévisualiser le build :
   ```bash
   npm run preview
   ```

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
