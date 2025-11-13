import JSZip from "jszip";
import dbf from "dbf";
import typesModule from "@mapbox/shp-write/src/types";
import pointWriter from "@mapbox/shp-write/src/points";
import polyWriter from "@mapbox/shp-write/src/poly";

const geometryTypes = typesModule?.geometries || {};

const WRITERS = {
  [geometryTypes.POINT]: pointWriter,
  [geometryTypes.POLYGON]: polyWriter,
  [geometryTypes.POLYLINE]: polyWriter,
};

export const LAMBERT_93_PRJ =
  'PROJCS["RGF93 / Lambert-93",GEOGCS["RGF93",DATUM["Reseau_Geodesique_Francais_1993",SPHEROID["GRS 1980",6378137,298.257222101],TOWGS84[0,0,0,0,0,0,0]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic_2SP"],PARAMETER["standard_parallel_1",49],PARAMETER["standard_parallel_2",44],PARAMETER["latitude_of_origin",46.5],PARAMETER["central_meridian",3],PARAMETER["false_easting",700000],PARAMETER["false_northing",6600000],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["X",EAST],AXIS["Y",NORTH],AUTHORITY["EPSG","2154"]]';

function sanitizeBaseName(baseName) {
  const normalized = (baseName ?? "").toString().trim();
  if (!normalized) return "parcelles";
  const ascii = normalized
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^0-9A-Za-z _-]+/g, "")
    .replace(/\s+/g, "_");
  const safe = ascii.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return safe || "parcelles";
}

function writeShapefile(rows, geometryType, geometries, fields) {
  const TYPE = geometryTypes[geometryType];
  if (TYPE == null) {
    throw new Error(`Unsupported geometry type: ${geometryType}`);
  }
  const writer = WRITERS[TYPE];
  if (!writer) {
    throw new Error(`No writer configured for geometry type: ${geometryType}`);
  }
  const parts = writer.parts(geometries, TYPE);
  const shpLength = 100 + (parts - geometries.length) * 4 + writer.shpLength(geometries);
  const shxLength = 100 + writer.shxLength(geometries);

  const shpBuffer = new ArrayBuffer(shpLength);
  const shpView = new DataView(shpBuffer);
  const shxBuffer = new ArrayBuffer(shxLength);
  const shxView = new DataView(shxBuffer);
  const extent = writer.extent(geometries);

  writeHeader(shpView, TYPE);
  writeHeader(shxView, TYPE);
  writeExtent(extent, shpView);
  writeExtent(extent, shxView);

  writer.write(
    geometries,
    extent,
    new DataView(shpBuffer, 100),
    new DataView(shxBuffer, 100),
    TYPE
  );

  shpView.setInt32(24, shpLength / 2);
  shxView.setInt32(24, 50 + geometries.length * 4);

  const dbfBuf = dbf.structure(rows, fields);

  return { shp: shpView, shx: shxView, dbf: dbfBuf };
}

function writeHeader(view, TYPE) {
  view.setInt32(0, 9994);
  view.setInt32(28, 1000, true);
  view.setInt32(32, TYPE, true);
}

function writeExtent(extent, view) {
  view.setFloat64(36, extent.xmin, true);
  view.setFloat64(44, extent.ymin, true);
  view.setFloat64(52, extent.xmax, true);
  view.setFloat64(60, extent.ymax, true);
}

function buildRows(features, fields) {
  return features.map((feature) => {
    const row = {};
    fields.forEach(({ name }) => {
      row[name] = feature.properties?.[name] ?? null;
    });
    return row;
  });
}

export async function createShapefileZip({
  features,
  baseName,
  fields,
  prj = LAMBERT_93_PRJ,
}) {
  if (!Array.isArray(features) || !features.length) {
    throw new Error("SHAPE_ZIP: No features to export");
  }
  const polygonFeatures = features.filter((feature) => {
    const type = feature?.geometry?.type;
    return (
      (type === "Polygon" || type === "MultiPolygon") &&
      Array.isArray(feature.geometry.coordinates)
    );
  });
  if (!polygonFeatures.length) {
    throw new Error("SHAPE_ZIP: No polygon geometries to export");
  }
  const geometries = polygonFeatures.map((feature) => feature.geometry.coordinates);
  const rows = buildRows(polygonFeatures, fields);
  const { shp, shx, dbf: dbfBuf } = writeShapefile(rows, "POLYGON", geometries, fields);
  const zip = new JSZip();
  const safeBaseName = sanitizeBaseName(baseName);
  zip.file(`${safeBaseName}.shp`, shp.buffer, { binary: true });
  zip.file(`${safeBaseName}.shx`, shx.buffer, { binary: true });
  zip.file(`${safeBaseName}.dbf`, dbfBuf.buffer, { binary: true });
  zip.file(`${safeBaseName}.prj`, prj);
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

export function getSafeBaseName(input) {
  return sanitizeBaseName(input);
}
