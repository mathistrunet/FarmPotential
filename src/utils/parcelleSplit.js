import buffer from "@turf/buffer";
import * as polygonClipping from "polygon-clipping";
import { polygonAreaM2 } from "./geometry";

const polygonClippingModule = polygonClipping;
const clipDifference =
  polygonClippingModule.difference ?? polygonClippingModule.default?.difference;

function getClippingGeometry(feature) {
  if (!feature?.geometry) return null;
  if (feature.geometry.type === "Polygon") return feature.geometry.coordinates;
  if (feature.geometry.type === "MultiPolygon") return feature.geometry.coordinates;
  return null;
}

function toPolygonList(result) {
  if (!Array.isArray(result)) return [];
  return result
    .filter((polygon) => Array.isArray(polygon) && polygon.length > 0)
    .filter((polygon) => polygonAreaM2(polygon) > 0.01)
    .sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a));
}

export function splitParcelleByLine(feature, splitLine, splitWidthMeters = 0.2) {
  if (!clipDifference) return [];
  const parcelGeometry = getClippingGeometry(feature);
  if (!parcelGeometry || splitLine?.geometry?.type !== "LineString") return [];

  const bufferedLine = buffer(splitLine, splitWidthMeters, { units: "meters" });
  const lineGeometry = getClippingGeometry(bufferedLine);
  if (!lineGeometry) return [];

  const diff = clipDifference(parcelGeometry, lineGeometry);
  return toPolygonList(diff);
}

