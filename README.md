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

## IGN / GeoPlateforme API key and endpoints
Some raster layers (e.g. IGN plan and ortho imagery) require an API key. Obtain
an API key from [IGN GeoPlateforme](https://geoservices.ign.fr/) and set it in
`src/config/rasterLayers.js`:
```js
const geoPfKey = import.meta.env.VITE_GEO_PORTAIL_API_KEY;
const withGeoPfKey = (template) =>
  geoPfKey ? `${template}?apikey=${geoPfKey}` : template;

// Generic WMTS template (e.g. ORTHOIMAGERY.ORTHOPHOTOS or SOL.SOL)
map.addSource("wmts-layer", {
  type: "raster",
  tiles: [
    withGeoPfKey(
      `https://data.geopf.fr/wmts/${LAYER}/default/PM/{z}/{x}/{y}.${EXT}`,
    ),
  ],
  tileSize: 256,
  attribution: "© IGN",
});
map.addLayer({ id: "wmts-layer", type: "raster", source: "wmts-layer" });
```

### Reading the GeoPlateforme WMTS capabilities
Use the GetCapabilities document to confirm the correct `LAYER`,
`TILEMATRIXSET` (usually `PM` for WebMercator) and `FORMAT` values before
configuring MapLibre:

```bash
curl "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetCapabilities" \
  | xmllint --format - \
  | rg -n "<Layer>" -A6
```
The application now targets the new `https://data.geopf.fr` endpoints. The IGN
Plan base map can be loaded through the GeoPlateforme TMS service and other
layers (such as orthophotos or the soil map) rely on the WMTS endpoint on the
same host.

### MapLibre snippets
```js
// PLAN.IGN as a TMS raster base (y axis is flipped compared to XYZ)
map.addSource("planign", {
  type: "raster",
  tiles: [
    `https://data.geopf.fr/tiles/PLAN.IGN/{z}/{x}/{y}.png?apikey=${YOUR_IGN_KEY}`,
  ],
  tileSize: 256,
  attribution: "© IGN",
  scheme: "tms",
});
map.addLayer({ id: "planign", type: "raster", source: "planign" });

// Generic WMTS template (e.g. ORTHOIMAGERY.ORTHOPHOTOS or SOL.SOL)
map.addSource("wmts-layer", {
  type: "raster",
  tiles: [
    `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${LAYER}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}&FORMAT=${FORMAT}&apikey=${YOUR_IGN_KEY}`,
  ],
  tileSize: 256,
  attribution: "© IGN",
});
map.addLayer({ id: "wmts-layer", type: "raster", source: "wmts-layer" });
```

### Reading the GeoPlateforme WMTS capabilities
Use the GetCapabilities document to confirm the correct `LAYER`,
`TILEMATRIXSET` (usually `PM` for WebMercator) and `FORMAT` values before
configuring MapLibre:

```bash
curl "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetCapabilities&apikey=${YOUR_IGN_KEY}" \
  | xmllint --format - \
  | rg -n "<Layer>" -A6
```

In the XML output you will find each `<Layer>` block listing the identifier to
use in the `LAYER` parameter along with compatible `<TileMatrixSetLink>` entries
(`PM` is the standard WebMercator pyramid) and supported output formats such as
`image/png` or `image/jpeg`. Pick the matching values for the WMTS URL template
shown above.

Without a key, only open data layers such as OpenStreetMap will be available.

## Linting
Run ESLint on the project with:
```bash
npm run lint
```

## SoilGrids (point GPS)
- Endpoint interne: `GET /api/parcels/{parcelId}/soilgrids?refresh=true|false&depth_profile=0-5cm,5-15cm,...`
- Source: SoilGrids v2 `properties/query` (résolution ~250m).
- Cache backend: `data/parcel-soilgrids-cache.json` avec TTL par défaut de 30 jours (modifiable dans `SoilGridsCacheRepository`).
- Déduplication par pixel: la clé de cache est le pixel natif SoilGrids 250 m (projection Homolosine, `scripts/soilgrids/homolosine.mjs`). Toutes les parcelles d'un même pixel partagent un seul appel ISRIC ; le rate-limit (60/min) ne compte que les vrais appels amont (les cache-hits sont gratuits).
- Stratégie du point: `SOILGRIDS_POINT_STRATEGY=centroid|inside_point` (fallback automatique bbox center si géométrie invalide). Le point d'échantillonnage (lat/lon/stratégie) est conservé dans le cache et la réponse normalisée.
- Les indicateurs dérivés (texture, MO, porosité, RU, drainage, profondeur cible) sont heuristiques et affichés comme estimations.
