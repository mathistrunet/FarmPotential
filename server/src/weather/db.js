import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
let db = null;
function getDatabase() {
    if (db)
        return db;
    const dbPath = process.env.WEATHER_DB_PATH
        ? path.resolve(process.cwd(), process.env.WEATHER_DB_PATH)
        : path.resolve(process.cwd(), 'weather.sqlite');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initialiseSchema(db);
    return db;
}
function initialiseSchema(database) {
    database.exec(`
    CREATE TABLE IF NOT EXISTS stations (
      id TEXT PRIMARY KEY,
      name TEXT,
      city TEXT,
      lat REAL,
      lon REAL,
      altitude REAL,
      type TEXT
    );

    CREATE TABLE IF NOT EXISTS observations (
      station_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      t REAL,
      tmin REAL,
      tmax REAL,
      rr REAL,
      rr24 REAL,
      wind REAL,
      wind_gust REAL,
      humidity REAL,
      pressure REAL,
      PRIMARY KEY (station_id, ts)
    );

    CREATE TABLE IF NOT EXISTS cache_requests (
      hash TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
export function upsertStations(stations) {
    if (!stations.length)
        return;
    const database = getDatabase();
    ensureStationCityColumn(database);
    const statement = database.prepare(`INSERT INTO stations (id, name, city, lat, lon, altitude, type)
     VALUES (@id, @name, @city, @lat, @lon, @altitude, @type)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       city = excluded.city,
       lat = excluded.lat,
       lon = excluded.lon,
       altitude = excluded.altitude,
       type = excluded.type`);
    const insertMany = database.transaction((rows) => {
        for (const row of rows) {
            statement.run({
                id: row.id,
                name: row.name,
                city: row.city,
                lat: row.lat,
                lon: row.lon,
                altitude: row.altitude,
                type: row.type,
            });
        }
    });
    insertMany(stations);
}
function ensureStationCityColumn(database) {
    const columns = database.prepare("PRAGMA table_info(stations)").all();
    const hasCity = columns.some((column) => column.name === 'city');
    if (!hasCity) {
        database.exec('ALTER TABLE stations ADD COLUMN city TEXT');
    }
}
export function listStations() {
    const database = getDatabase();
    ensureStationCityColumn(database);
    const rows = database
        .prepare('SELECT id, name, city, lat, lon, altitude, type FROM stations WHERE lat IS NOT NULL AND lon IS NOT NULL')
        .all();
    return rows
        .map((row) => ({
        id: String(row.id),
        name: typeof row.name === 'string' && row.name ? row.name : String(row.id),
        city: typeof row.city === 'string' && row.city ? row.city : null,
        lat: Number(row.lat),
        lon: Number(row.lon),
        altitude: row.altitude != null ? Number(row.altitude) : null,
        type: typeof row.type === 'string' && row.type ? row.type : null,
    }))
        .filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lon));
}
export function upsertObservations(stationId, observations) {
    if (!observations.length)
        return;
    const database = getDatabase();
    const statement = database.prepare(`INSERT INTO observations (
        station_id, ts, t, tmin, tmax, rr, rr24, wind, wind_gust, humidity, pressure
     ) VALUES (
        @station_id, @ts, @t, @tmin, @tmax, @rr, @rr24, @wind, @wind_gust, @humidity, @pressure
     ) ON CONFLICT(station_id, ts) DO UPDATE SET
        t = excluded.t,
        tmin = excluded.tmin,
        tmax = excluded.tmax,
        rr = excluded.rr,
        rr24 = excluded.rr24,
        wind = excluded.wind,
        wind_gust = excluded.wind_gust,
        humidity = excluded.humidity,
        pressure = excluded.pressure`);
    const insertMany = database.transaction((rows) => {
        for (const row of rows) {
            statement.run({
                station_id: stationId,
                ts: row.ts,
                t: row.t,
                tmin: row.tmin,
                tmax: row.tmax,
                rr: row.rr,
                rr24: row.rr24,
                wind: row.wind,
                wind_gust: row.windGust,
                humidity: row.humidity,
                pressure: row.pressure,
            });
        }
    });
    insertMany(observations);
}
export function listObservations(stationId, startISO, endISO) {
    const database = getDatabase();
    const statement = database.prepare(`SELECT station_id, ts, t, tmin, tmax, rr, rr24, wind, wind_gust, humidity, pressure
     FROM observations
     WHERE station_id = ? AND ts BETWEEN ? AND ?
     ORDER BY ts ASC`);
    const rows = statement.all(stationId, startISO, endISO);
    return rows.map((row) => ({
        stationId: row.station_id,
        ts: row.ts,
        t: row.t,
        tmin: row.tmin,
        tmax: row.tmax,
        rr: row.rr,
        rr24: row.rr24,
        wind: row.wind,
        windGust: row.wind_gust,
        humidity: row.humidity,
        pressure: row.pressure,
    }));
}
export function getCachedRequest(hash, ttlHours) {
    const database = getDatabase();
    const row = database
        .prepare('SELECT payload, created_at FROM cache_requests WHERE hash = ?')
        .get(hash);
    if (!row)
        return null;
    const createdAt = new Date(row.created_at);
    const ageMs = Date.now() - createdAt.getTime();
    if (ageMs > ttlHours * 3600 * 1000) {
        database.prepare('DELETE FROM cache_requests WHERE hash = ?').run(hash);
        return null;
    }
    try {
        return JSON.parse(row.payload);
    }
    catch (error) {
        database.prepare('DELETE FROM cache_requests WHERE hash = ?').run(hash);
        return null;
    }
}
export function setCachedRequest(hash, payload) {
    const database = getDatabase();
    database
        .prepare('INSERT INTO cache_requests (hash, payload, created_at) VALUES (?, ?, ?) ON CONFLICT(hash) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at')
        .run(hash, JSON.stringify(payload), new Date().toISOString());
}
export function hashRequest(parts) {
    const hash = crypto.createHash('sha256');
    hash.update(parts.join('|'));
    return hash.digest('hex');
}
export function clearCacheOlderThan(ttlHours) {
    const database = getDatabase();
    const threshold = new Date(Date.now() - ttlHours * 3600 * 1000).toISOString();
    database.prepare('DELETE FROM cache_requests WHERE created_at < ?').run(threshold);
}
export { getDatabase };
