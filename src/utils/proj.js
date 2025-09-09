import proj4 from "proj4";

// Défini dansproj4 la projection en Lambert-93
proj4.defs(
  "EPSG:2154",
  "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
);

// 2 fonction pour convertir les coordonnées selon les besoins
export const toLambert93 = ([lon, lat]) =>
  proj4("EPSG:4326", "EPSG:2154", [lon, lat]);

export const toWgs84 = ([x, y]) => proj4("EPSG:2154", "EPSG:4326", [x, y]);

export default proj4;
