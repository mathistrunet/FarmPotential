import type { LngLatLike, Map } from "maplibre-gl";
import type { SoilsLayerConfig } from "../types/soils";

function lngLatTo3857(lng: number, lat: number) {
  const R = 6378137.0;
  const x = R * (lng * Math.PI) / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return { x, y };
}

export async function getFeatureInfoWMS(map: Map, lngLat: LngLatLike, cfg: SoilsLayerConfig) {
  const bounds = map.getBounds();
  const sw = lngLatTo3857(bounds.getWest(), bounds.getSouth());
  const ne = lngLatTo3857(bounds.getEast(), bounds.getNorth());
  const bbox = `${sw.x},${sw.y},${ne.x},${ne.y}`;

  const canvas = map.getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const point = map.project(lngLat as any);
  const i = Math.round(point.x);
  const j = Math.round(point.y);

  const version = cfg.wms!.version || "1.3.0";
  const crsParam = version === "1.3.0" ? "CRS" : "SRS";
  const xyParamX = version === "1.3.0" ? "I" : "X";
  const xyParamY = version === "1.3.0" ? "J" : "Y";

  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetFeatureInfo",
    VERSION: version,
    LAYERS: cfg.wms!.layer,
    QUERY_LAYERS: cfg.wms!.layer,
    STYLES: "",
    FORMAT: "image/png",
    INFO_FORMAT: cfg.wms!.infoFormat,
    TRANSPARENT: "TRUE",
    [crsParam]: "EPSG:3857",
    WIDTH: String(width),
    HEIGHT: String(height),
    BBOX: bbox,
    [xyParamX]: String(i),
    [xyParamY]: String(j),
  });
  const url = `${cfg.wms!.url}?${params.toString()}`;

  const resp = await fetch(url);
  const ct = resp.headers.get("content-type") || "";
  const data = ct.includes("json") ? await resp.json() : await resp.text();
  if (!resp.ok) throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  return data;
}

export async function getFeatureInfoWFS(lngLat: LngLatLike, cfg: SoilsLayerConfig) {
  const bbox = `${(lngLat as any).lng},${(lngLat as any).lat},${(lngLat as any).lng},${(lngLat as any).lat}`;
  const url = `${cfg.wfs!.url}?service=WFS&version=2.0.0&request=GetFeature&typeName=${cfg.wfs!.typeName}&outputFormat=application/json&srsName=EPSG:4326&bbox=${bbox}`;
  const resp = await fetch(url);
  return resp.json();
}

