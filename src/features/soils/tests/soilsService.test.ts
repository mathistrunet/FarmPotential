import { beforeEach, describe, expect, it, vi } from "vitest";
import { getInfoAtPoint } from "../services/soilsAdapter";
import { SOILS_LAYERS } from "../config/soilsConfig";

// fake map with minimal methods
const fakeMap: any = {
  getBounds: () => ({
    getWest: () => 0,
    getSouth: () => 0,
    getEast: () => 10,
    getNorth: () => 10,
  }),
  getCanvas: () => ({ width: 100, height: 100, clientWidth: 100, clientHeight: 100 }),
  project: () => ({ x: 50, y: 50 }),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("soilsAdapter", () => {
  it("adapts WMS GetFeatureInfo responses", async () => {
    SOILS_LAYERS[0].mode = "wms";
      const fetchSpy = vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => "application/json" },
          json: () =>
            Promise.resolve({
              features: [
                {
                  properties: {
                    RRP_LABEL: "SolA",
                    RRP_CODE: "A1",
                    TEXTURE: "argile",
                    PCT_ARGILE: 50,
                  },
                  geometry: null,
                },
              ],
            }),
          text: () => Promise.resolve(""),
        }) as any
      );
    vi.stubGlobal("fetch", fetchSpy);
    const info = await getInfoAtPoint(fakeMap, { lng: 1, lat: 2 }, SOILS_LAYERS[0]);
    expect(info?.title).toBe("SolA");
      expect(info?.attributes.RRP_CODE).toBe("A1");
      expect(info?.proportions?.PCT_ARGILE).toBe(50);
    const url = fetchSpy.mock.calls[0][0];
    expect(url).toMatch(/FORMAT=image%2Fpng/);
    expect(url).toMatch(/STYLES=/);
  });

  it("adapts WFS GetFeature responses", async () => {
    SOILS_LAYERS[0].mode = "wfs";
      vi.stubGlobal(
        "fetch",
        () =>
          Promise.resolve({
            ok: true,
            headers: { get: () => "application/json" },
            json: () =>
              Promise.resolve({
                features: [
                  {
                    properties: {
                      RRP_LABEL: "SolB",
                      RRP_CODE: "B2",
                      TEXTURE: "sable",
                      TAUX_SABLE: 60,
                    },
                    geometry: null,
                  },
                ],
              }),
            text: () => Promise.resolve(""),
          }) as any
      );
    const info = await getInfoAtPoint(fakeMap, { lng: 3, lat: 4 }, SOILS_LAYERS[0]);
      expect(info?.title).toBe("SolB");
      expect(info?.attributes.TEXTURE).toBe("sable");
      expect(info?.proportions?.TAUX_SABLE).toBe(60);
  });
});
