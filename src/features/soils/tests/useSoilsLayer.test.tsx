// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
vi.mock("maplibre-gl", () => {
  class Popup {
    setLngLat() { return this; }
    setHTML() { return this; }
    addTo() { return this; }
  }
  return { __esModule: true, default: { Popup }, Popup };
});
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { useSoilsLayer } from "../hooks/useSoilsLayer";
import * as adapter from "../services/soilsAdapter";
import { SOILS_LAYERS } from "../config/soilsConfig";

describe("useSoilsLayer", () => {
  it("adds layer and calls adapter on click", async () => {
    SOILS_LAYERS[0].mode = "wms";
    const map: any = {
      getSource: vi.fn().mockReturnValue(null),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      getLayer: vi.fn().mockReturnValue(null),
      setLayoutProperty: vi.fn(),
      removeLayer: vi.fn(),
      removeSource: vi.fn(),
      getZoom: vi.fn(() => 12),
      getBounds: () => ({ getWest: () => 0, getSouth: () => 0, getEast: () => 10, getNorth: () => 10 }),
      getCanvas: () => ({ width: 100, height: 100 }),
    };
    const mapRef = { current: map };

    const adapterSpy = vi.spyOn(adapter, "getInfoAtPoint").mockResolvedValue(null);

    let toggle: any;
    function Comp() {
      const res = useSoilsLayer(mapRef);
      toggle = res.toggle;
      return null;
    }
    const div = document.createElement("div");
    act(() => {
      createRoot(div).render(<Comp />);
    });

    act(() => toggle());
    expect(map.addSource).toHaveBeenCalled();

    const clickHandler = map.on.mock.calls.find((c: any[]) => c[0] === "click")[1];
    await clickHandler({ lngLat: { lng: 1, lat: 2 } });
    expect(adapterSpy).toHaveBeenCalled();

    act(() => toggle());
    expect(map.off).toHaveBeenCalledWith("click", clickHandler);
  });
});
