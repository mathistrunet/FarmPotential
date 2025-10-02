import type { Database } from "sql.js";

import { getSqlModule } from "./rrpLocal";

type GeometryRow = {
  table: string;
  column: string;
  srs: number | null;
};

export type DepartmentFeatures = {
  code: string;
  features: GeoJSON.Feature[];
};

async function openGeoPackage(url: string): Promise<Database> {
  const base = typeof window !== "undefined" ? window.location.href : undefined;
  const resolvedUrl = new URL(url, base).toString();
  const resp = await fetch(resolvedUrl);
  if (!resp.ok) {
    throw new Error(`Could not download GeoPackage ${url}: ${resp.status} ${resp.statusText}`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  const sql = await getSqlModule();
  return new sql.Database(new Uint8Array(arrayBuffer));
}

function readGeometryInfo(db: Database): GeometryRow {
  const stmt = db.exec(
    `SELECT table_name, column_name, srs_id FROM gpkg_geometry_columns LIMIT 1`
  );
  if (!stmt.length) {
    throw new Error("GeoPackage has no geometry columns");
  }
  const [row] = stmt[0].values;
  const table = String(row[0]);
  const column = String(row[1]);
  const srs = row[2] != null ? Number(row[2]) : null;
  return { table, column, srs };
}

function readPrimaryKey(db: Database, table: string): string | null {
  const pragma = db.exec(`PRAGMA table_info("${table}")`);
  if (!pragma.length) return null;
  for (const row of pragma[0].values) {
    const isPk = Number(row[5]) === 1;
    if (isPk) return String(row[1]);
  }
  return null;
}

function geometryEnvelopeSize(flags: number) {
  const envelopeIndicator = (flags >> 1) & 0x7;
  switch (envelopeIndicator) {
    case 0:
      return 0;
    case 1:
      return 32; // minX, maxX, minY, maxY
    case 2:
    case 3:
      return 48; // XY + Z or XY + M
    case 4:
      return 64; // XY + Z + M
    default:
      throw new Error(`Unsupported envelope indicator: ${envelopeIndicator}`);
  }
}

function parseGeoPackageGeometry(bytes: Uint8Array): GeoJSON.Geometry | null {
  if (!bytes || bytes.length < 8) return null;
  if (bytes[0] !== 0x47 || bytes[1] !== 0x50) {
    throw new Error("Invalid GeoPackage geometry header");
  }
  const flags = bytes[3];
  const isEmpty = (flags & 0x10) !== 0;
  if (isEmpty) {
    return null;
  }
  const envelopeSize = geometryEnvelopeSize(flags);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = 8 + envelopeSize;
  const { geometry } = parseWkbGeometry(view, offset);
  return geometry;
}

type WkbParseResult = { geometry: GeoJSON.Geometry | null; offset: number };

function parseWkbGeometry(view: DataView, startOffset: number): WkbParseResult {
  let offset = startOffset;
  if (offset >= view.byteLength) {
    return { geometry: null, offset };
  }
  const byteOrder = view.getUint8(offset);
  offset += 1;
  const littleEndian = byteOrder === 1;
  let rawType = view.getUint32(offset, littleEndian);
  offset += 4;

  let hasZ = false;
  let hasM = false;
  let geometryType = rawType;

  if (rawType >= 3000 && rawType < 4000) {
    hasZ = true;
    hasM = true;
    geometryType = rawType - 3000;
  } else if (rawType >= 2000 && rawType < 3000) {
    hasM = true;
    geometryType = rawType - 2000;
  } else if (rawType >= 1000 && rawType < 2000) {
    hasZ = true;
    geometryType = rawType - 1000;
  }

  if ((rawType & 0x80000000) !== 0) hasZ = true;
  if ((rawType & 0x40000000) !== 0) hasM = true;
  if ((rawType & 0x20000000) !== 0) {
    // SRID present – skip it but we don't need the value
    offset += 4;
  }

  geometryType = geometryType & 0x000000ff;
  const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);

  const readPoint = (): [number, number] => {
    const x = view.getFloat64(offset, littleEndian);
    const y = view.getFloat64(offset + 8, littleEndian);
    if (dims > 2) {
      offset += 8 * dims;
    } else {
      offset += 16;
    }
    return [x, y];
  };

  const readPointArray = (count: number): GeoJSON.Position[] => {
    const coords: GeoJSON.Position[] = [];
    for (let i = 0; i < count; i++) {
      const [x, y] = readPoint();
      coords.push([x, y]);
    }
    return coords;
  };

  const readLineString = (): GeoJSON.LineString => {
    const numPoints = view.getUint32(offset, littleEndian);
    offset += 4;
    return { type: "LineString", coordinates: readPointArray(numPoints) };
  };

  const readLinearRing = (): GeoJSON.Position[] => {
    const numPoints = view.getUint32(offset, littleEndian);
    offset += 4;
    return readPointArray(numPoints);
  };

  const readPolygon = (): GeoJSON.Polygon => {
    const numRings = view.getUint32(offset, littleEndian);
    offset += 4;
    const rings: GeoJSON.Position[][] = [];
    for (let i = 0; i < numRings; i++) {
      rings.push(readLinearRing());
    }
    return { type: "Polygon", coordinates: rings };
  };

  switch (geometryType) {
    case 1: {
      const [x, y] = readPoint();
      return { geometry: { type: "Point", coordinates: [x, y] }, offset };
    }
    case 2: {
      const geom = readLineString();
      return { geometry: geom, offset };
    }
    case 3: {
      const geom = readPolygon();
      return { geometry: geom, offset };
    }
    case 4: {
      const numPoints = view.getUint32(offset, littleEndian);
      offset += 4;
      const coords = readPointArray(numPoints);
      return { geometry: { type: "MultiPoint", coordinates: coords }, offset };
    }
    case 5: {
      const numLines = view.getUint32(offset, littleEndian);
      offset += 4;
      const lines: GeoJSON.Position[][] = [];
      for (let i = 0; i < numLines; i++) {
        const { geometry, offset: next } = parseWkbGeometry(view, offset);
        if (!geometry || geometry.type !== "LineString") {
          throw new Error("Unexpected geometry in MultiLineString");
        }
        offset = next;
        lines.push(geometry.coordinates);
      }
      return { geometry: { type: "MultiLineString", coordinates: lines }, offset };
    }
    case 6: {
      const numPolygons = view.getUint32(offset, littleEndian);
      offset += 4;
      const polygons: GeoJSON.Position[][][] = [];
      for (let i = 0; i < numPolygons; i++) {
        const { geometry, offset: next } = parseWkbGeometry(view, offset);
        if (!geometry || geometry.type !== "Polygon") {
          throw new Error("Unexpected geometry in MultiPolygon");
        }
        offset = next;
        polygons.push(geometry.coordinates);
      }
      return { geometry: { type: "MultiPolygon", coordinates: polygons }, offset };
    }
    case 7: {
      const num = view.getUint32(offset, littleEndian);
      offset += 4;
      const geoms: GeoJSON.Geometry[] = [];
      for (let i = 0; i < num; i++) {
        const { geometry, offset: next } = parseWkbGeometry(view, offset);
        offset = next;
        if (geometry) geoms.push(geometry);
      }
      return { geometry: { type: "GeometryCollection", geometries: geoms }, offset };
    }
    default:
      throw new Error(`Unsupported WKB geometry type: ${geometryType}`);
  }
}

export async function loadDepartmentGeoJSON(
  code: string,
  basePath: string
): Promise<DepartmentFeatures> {
  const gpkgUrl = `${basePath}/code_insee_${code}.gpkg`;
  const db = await openGeoPackage(gpkgUrl);
  try {
    const { table, column } = readGeometryInfo(db);
    const pkColumn = readPrimaryKey(db, table);
    const result = db.exec(`SELECT * FROM "${table}"`);
    if (!result.length) {
      return { code, features: [] };
    }
    const columns = result[0].columns;
    const features: GeoJSON.Feature[] = [];
    for (const row of result[0].values) {
      const props: Record<string, unknown> = {};
      let geometry: GeoJSON.Geometry | null = null;
      let id: string | number | undefined;
      row.forEach((value, idx) => {
        const col = columns[idx];
        if (col === column) {
          if (value instanceof Uint8Array) {
            geometry = parseGeoPackageGeometry(value);
          }
        } else {
          props[col] = value;
          if (pkColumn && col === pkColumn) {
            id = value as string | number | undefined;
          }
        }
      });
      if (!geometry) continue;
      features.push({
        type: "Feature",
        id,
        geometry,
        properties: props,
      });
    }
    return { code, features };
  } finally {
    db.close();
  }
}
