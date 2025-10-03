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

## IGN / GeoPlateforme endpoints and optional API key
The application now targets the new `https://data.geopf.fr` endpoints. The IGN
Plan base map is loaded through the GeoPlateforme TMS service and other layers
(such as orthophotos or the soil map) rely on the WMTS endpoint on the same
host.

Many GeoPlateforme layers are published as open data and work without an API
key. When you need to unlock additional resources, create a GeoServices account
on [IGN GeoPlateforme](https://geoservices.ign.fr/) and expose your key to the
frontend by defining `VITE_GEO_PORTAIL_API_KEY` (for example in an `.env`
file):

```bash
VITE_GEO_PORTAIL_API_KEY=your-ign-key
```

### MapLibre snippets
```js
const geoPfKey = import.meta.env.VITE_GEO_PORTAIL_API_KEY;
const withGeoPfKey = (template) =>
  geoPfKey ? `${template}?apikey=${geoPfKey}` : template;

// PLAN.IGN as a TMS raster base (y axis is flipped compared to XYZ)
map.addSource("planign", {
  type: "raster",
  tiles: [
    withGeoPfKey("https://data.geopf.fr/tiles/PLAN.IGN/{z}/{x}/{y}.png"),
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

In the XML output you will find each `<Layer>` block listing the identifier to
use in the `LAYER` parameter along with compatible `<TileMatrixSetLink>` entries
(`PM` is the standard WebMercator pyramid) and supported output formats such as
`image/png` or `image/jpeg`. Pick the matching values for the WMTS URL template
shown above.

## Linting
Run ESLint on the project with:
```bash
npm run lint
```
