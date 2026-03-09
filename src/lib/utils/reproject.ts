import proj4 from 'proj4';

const EPSG_2154 = 'EPSG:2154';
const EPSG_4326 = 'EPSG:4326';

const definition2154 = '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const definition4326 = '+proj=longlat +datum=WGS84 +no_defs';

if (!proj4.defs(EPSG_2154)) {
  proj4.defs(EPSG_2154, definition2154);
}

if (!proj4.defs(EPSG_4326)) {
  proj4.defs(EPSG_4326, definition4326);
}

export function toWgs842154(point: [number, number]): [number, number] {
  const [x, y] = point;
  const [lon, lat] = proj4(EPSG_2154, EPSG_4326, [x, y]);
  return [Number(lon), Number(lat)];
}

export function isLambert93(point: [number, number]): boolean {
  const [x, y] = point;
  return x >= 600000 && x <= 1300000 && y >= 6000000 && y <= 7200000;
}

export function isLambert93Collection(points: Array<[number, number]>): boolean {
  if (points.length === 0) {
    return false;
  }

  return points.every((pt) => isLambert93(pt));
}
