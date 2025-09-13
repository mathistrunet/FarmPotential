import { useEffect } from "react";
import type maplibregl from "maplibre-gl";

// ⬇️ imports RELATIFS (plus d'alias "@")
import { loadLocalRrpMbtiles, lonLatToTile, pickProp } from "../services/rrpLocal";
import {
  FIELD_UCS,
  FIELD_LIB,
  DEFAULT_FILL,
  DEFAULT_OUTLINE,
  DEFAULT_FILL_OPACITY,
} from "../config/soilsLocalConfig";
import {
  loadRrpLookup,
  loadRrpColors,
  keyFromProps,
  formatAreaHa,
  centroidLonLat,
} from "../lib/rrpLookup";
import type { RrpEntry } from "../lib/rrpLookup";

// Limite le nombre de features affichées pour garder de bonnes perf
const MAX_FEATURES = 100;
// Zoom minimum pour afficher la couche
const MIN_ZOOM = 8;

type Options = {
  map: maplibregl.Map | null;
  mbtilesUrl?: string;
  sourceId?: string;
  fillLayerId?: string;
  lineLayerId?: string;
  labelLayerId?: string;
  zIndex?: number;
  visible?: boolean;
  fillOpacity?: number;
};

export function useSoilLayerLocal({
  map,
  mbtilesUrl = "/data/02_Donnees_Travail.mbtiles",
  sourceId = "soils-rrp",
  fillLayerId = "soils-rrp-fill",
  lineLayerId = "soils-rrp-outline",
  labelLayerId = "soils-rrp-label",
  zIndex = 10,
  visible = true,
  fillOpacity = DEFAULT_FILL_OPACITY,
}: Options) {
  useEffect(() => {
    if (!map) return;

    if (!visible) {
      if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
      if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
      if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }
    let aborted = false;
    let update: (() => void) | undefined;

    async function add() {
      try {
        if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
        if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);

        const [reader, colors] = await Promise.all([
          loadLocalRrpMbtiles(mbtilesUrl),
          loadRrpColors(),
        ]);
        if (aborted) return;

        const tileCache = new Map<string, GeoJSON.Feature[]>();

        map.addSource(sourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          promoteId: "id",
        });

        const colorExpr: any[] = [
          "match",
          ["to-string", ["coalesce", ["get", "code_coul"], ["get", "CODE_COUL"]]],
        ];
        Object.entries(colors).forEach(([code, hex]) => {
          colorExpr.push(code, hex);
        });
        colorExpr.push(DEFAULT_FILL);

        map.addLayer(
          {
            id: fillLayerId,
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": colorExpr,
              "fill-opacity": fillOpacity,
            },
          },
          getLayerIdBelow(map, zIndex) || undefined
        );

        map.addLayer(
          {
            id: lineLayerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": DEFAULT_OUTLINE,
              "line-width": 0.6,
              "line-opacity": 0.9,
            },
          },
          getLayerIdBelow(map, zIndex + 1) || undefined
        );

        const labelExpr: any = [
          "coalesce",
          ["to-string", ["get", FIELD_UCS[0]]],
          ["to-string", ["get", FIELD_LIB[0] ?? FIELD_UCS[0]]],
        ];

        map.addLayer(
          {
            id: labelLayerId,
            type: "symbol",
            source: sourceId,
            layout: {
              "text-field": labelExpr,
              "text-size": 10,
              "text-allow-overlap": false,
            },
            paint: {
              "text-color": "#222",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.2,
            },
          },
          getLayerIdBelow(map, zIndex + 2) || undefined
        );

        update = () => {
          if (map.getZoom() < MIN_ZOOM) {
            (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
              type: "FeatureCollection",
              features: [],
            });
            return;
          }
          const bounds = map.getBounds();
          const z = Math.floor(map.getZoom());
          const nw = lonLatToTile(bounds.getWest(), bounds.getNorth(), z);
          const se = lonLatToTile(bounds.getEast(), bounds.getSouth(), z);
          const all: GeoJSON.Feature[] = [];
          for (let x = nw.x; x <= se.x; x++) {
            for (let y = nw.y; y <= se.y; y++) {
              const key = `${z}/${x}/${y}`;
              let feats = tileCache.get(key);
              if (!feats) {
                const fc = reader.getTileGeoJSON(z, x, y);
                feats = fc ? fc.features : [];
                tileCache.set(key, feats);
              }
              all.push(...feats);
            }
          }
          (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
            type: "FeatureCollection",
            features: all.slice(0, MAX_FEATURES),
          });
        };

        update();
        map.on("moveend", update);
        map.on("zoomend", update);

        map.on("click", fillLayerId, async (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const props: Record<string, any> = f.properties ?? {};
          const feature = {
            type: "Feature",
            geometry: f.geometry,
            properties: {},
          } as any;
          const areaHa = formatAreaHa(feature);
          const [lon, lat] = centroidLonLat(feature);

          let lookupEntry: RrpEntry | undefined;
          let colorHex: string | undefined;
          try {
            const [lookup, colors] = await Promise.all([
              loadRrpLookup(),
              loadRrpColors(),
            ]);
            lookupEntry = lookup[keyFromProps(props)];
            colorHex = colors[String(props.code_coul)] ?? undefined;
          } catch {
            /* already logged */
          }
          const summaryRows = [
            ["Étude", props.NO_ETUDE ?? "—"],
            ["UCS", props.NO_UCS ?? "—"],
            [
              "Couleur",
              `${props.code_coul ?? "—"}${
                colorHex ? ` (${colorHex})` : ""
              }`,
            ],
            ["Surface (ha)", areaHa],
            ["Centroïde", `${lon}, ${lat}`],
          ]
            .map(
              ([k, v]) =>
                `<tr><th style="text-align:left;">${escapeHtml(String(
                  k
                ))}</th><td>${escapeHtml(String(v))}</td></tr>`
            )
            .join("");

          let html = `<div style="font: 12px/1.4 system-ui, sans-serif; max-width:260px;">`;
          html += `<h3 style="margin:0 0 4px">UCS ${escapeHtml(
            String(props.NO_UCS ?? "—")
          )} — Étude ${escapeHtml(String(props.NO_ETUDE ?? "—"))}</h3>`;
          html += `<table style="border-collapse:collapse;margin:0 0 6px;"><tbody>${summaryRows}</tbody></table>`;

          const nomUcs = lookupEntry?.nom_ucs ?? pickProp(props, ["NOM_UCS", "nom_ucs"]);
          const regNat = lookupEntry?.reg_nat ?? pickProp(props, ["REG_NAT", "reg_nat"]);
          const altMin = lookupEntry?.alt_min ?? pickProp(props, ["ALT_MIN", "alt_min"]);
          const altMod = lookupEntry?.alt_mod ?? pickProp(props, ["ALT_MOD", "alt_mod"]);
          const altMax = lookupEntry?.alt_max ?? pickProp(props, ["ALT_MAX", "alt_max"]);
          const nbUts = lookupEntry?.nb_uts ?? pickProp(props, ["NB_UTS", "nb_uts"]);
          const utsList = lookupEntry?.uts;

          if (
            nomUcs != null ||
            regNat != null ||
            altMin != null ||
            altMod != null ||
            altMax != null ||
            nbUts != null ||
            (utsList && utsList.length)
          ) {
            html += `<div style="margin-top:4px"><b>Contexte UCS</b></div>`;
            html += `<div>Nom : ${escapeHtml(String(nomUcs ?? "—"))}</div>`;
            html += `<div>Région nat. : ${escapeHtml(String(regNat ?? "—"))}</div>`;
            html += `<div>Alt. min/mod/max : ${escapeHtml([
              altMin ?? "—",
              altMod ?? "—",
              altMax ?? "—",
            ].join("/"))}</div>`;
            html += `<div>Nb UTS : ${escapeHtml(String(nbUts ?? "—"))}</div>`;
            if (utsList?.length) {
              const utsItems = utsList
                .slice()
                .sort((a, b) => b.pourcent - a.pourcent)
                .map(
                  (u) =>
                    `<li>${escapeHtml(String(
                      u.pourcent ?? "—"
                    ))} — ${escapeHtml(u.rp_2008_nom ?? "—")}</li>`
                )
                .join("");
              html += `<div style="margin-top:4px"><b>Composition UTS (%)</b></div><ul style="margin:4px 0 0 16px; padding:0;">${utsItems}</ul>`;
            }
          }

          html += `</div>`;

          new (window as any).maplibregl.Popup({ closeButton: true })
            .setLngLat(e.lngLat as any)
            .setHTML(html)
            .addTo(map);
        });

        map.on("mouseenter", fillLayerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", fillLayerId, () => {
          map.getCanvas().style.cursor = "";
        });
      } catch (err) {
        console.error("RRP local error:", err);
      }
    }

    add();
    return () => {
      aborted = true;
      if (update) {
        map.off("moveend", update);
        map.off("zoomend", update);
      }
    };
  }, [map, visible, mbtilesUrl, sourceId, fillLayerId, lineLayerId, labelLayerId, zIndex]);

  useEffect(() => {
    if (!map) return;
    if (map.getLayer(fillLayerId)) {
      map.setPaintProperty(fillLayerId, "fill-opacity", fillOpacity);
    }
  }, [map, fillLayerId, fillOpacity]);
}

function getLayerIdBelow(map: maplibregl.Map, zIndex: number): string | null {
  const layers = map.getStyle()?.layers ?? [];
  if (!layers.length) return null;
  const idx = Math.min(zIndex, layers.length - 1);
  return layers[idx]?.id ?? null;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
      c as "&" | "<" | ">" | '"' | "'"
    ] as string)
  );
}
