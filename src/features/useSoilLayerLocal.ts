import { useEffect } from "react";
import type maplibregl from "maplibre-gl";

// ⬇️ imports RELATIFS (plus d'alias "@")
import { loadLocalRrpZip } from "../services/rrpLocal";
import {
  FIELD_UCS,
  FIELD_TEXTURE,
  FIELD_LIB,
  TEXTURE_COLORS,
  DEFAULT_FILL,
  DEFAULT_OUTLINE,
  DEFAULT_FILL_OPACITY,
} from "../config/soilsLocalConfig";
import {
  loadRrpLookup,
  keyFromProps,
  formatAreaHa,
  centroidLonLat,
} from "../lib/rrpLookup";
import type { RrpEntry } from "../lib/rrpLookup";

type Options = {
  map: maplibregl.Map | null;
  zipUrl?: string;
  sourceId?: string;
  fillLayerId?: string;
  lineLayerId?: string;
  labelLayerId?: string;
  zIndex?: number;
  visible?: boolean;
};

export function useSoilLayerLocal({
  map,
  zipUrl = "/data/rrp_occitanie.zip",
  sourceId = "soils-rrp",
  fillLayerId = "soils-rrp-fill",
  lineLayerId = "soils-rrp-outline",
  labelLayerId = "soils-rrp-label",
  zIndex = 10,
  visible = true,
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

    async function add() {
      try {
        if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
        if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);

        const gj = await loadLocalRrpZip(zipUrl);
        if (aborted) return;

        map.addSource(sourceId, {
          type: "geojson",
          data: gj,
          promoteId: "id",
        });

        const textureKey: any = [
          "coalesce",
          ["get", FIELD_TEXTURE[0]],
          ["get", FIELD_TEXTURE[1] ?? FIELD_TEXTURE[0]],
          ["get", FIELD_TEXTURE[2] ?? FIELD_TEXTURE[0]],
          ["get", FIELD_TEXTURE[3] ?? FIELD_TEXTURE[0]],
        ];

        const colorExpr: any[] = ["case"];
        Object.entries(TEXTURE_COLORS).forEach(([tex, color]) => {
          colorExpr.push(["==", ["downcase", textureKey], tex], color);
        });
        colorExpr.push(DEFAULT_FILL);

        map.addLayer(
          {
            id: fillLayerId,
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": colorExpr,
              "fill-opacity": DEFAULT_FILL_OPACITY,
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
          try {
            const lookup = await loadRrpLookup();
            lookupEntry = lookup[keyFromProps(props)];
          } catch {
            /* already logged */
          }

          const colorHex = lookupEntry?.color_hex;
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

          if (lookupEntry) {
            html += `<div style="margin-top:4px"><b>Contexte UCS</b></div>`;
            html += `<div>Nom : ${escapeHtml(
              lookupEntry.nom_ucs ?? "—"
            )}</div>`;
            html += `<div>Région nat. : ${escapeHtml(
              lookupEntry.reg_nat ?? "—"
            )}</div>`;
            html += `<div>Alt. min/mod/max : ${escapeHtml(
              [
                lookupEntry.alt_min ?? "—",
                lookupEntry.alt_mod ?? "—",
                lookupEntry.alt_max ?? "—",
              ].join("/")
            )}</div>`;
            html += `<div>Nb UTS : ${escapeHtml(
              String(lookupEntry.nb_uts ?? "—")
            )}</div>`;
            if (lookupEntry.uts?.length) {
              const utsItems = lookupEntry.uts
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
    };
  }, [map, visible, zipUrl, sourceId, fillLayerId, lineLayerId, labelLayerId, zIndex]);
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
