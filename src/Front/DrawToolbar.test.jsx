// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

if (typeof window.URL.createObjectURL !== "function") {
  window.URL.createObjectURL = () => "blob:test";
  window.URL.revokeObjectURL = () => {};
}

const { default: DrawToolbar } = await import("./DrawToolbar");

/**
 * Faux Mapbox Draw. Point clé reproduit ici : `draw.modechange` n'est PAS émis
 * quand le mode est changé par un appel à `changeMode()` — c'est le
 * comportement réel de mapbox-gl-draw, et la cause du bug de coloration.
 */
function makeDrawStub() {
  const listeners = new Map();
  const draw = {
    mode: "simple_select",
    changeMode: vi.fn(function (nextMode) {
      this.mode = nextMode; // aucun évènement émis, volontairement
    }),
    getAll: () => ({ type: "FeatureCollection", features: [] }),
    getSelectedIds: () => [],
    trash: vi.fn(),
  };
  const map = {
    on: (event, handler) => {
      listeners.set(event, [...(listeners.get(event) || []), handler]);
    },
    off: () => {},
    getCanvas: () => ({ style: {} }),
    getStyle: () => ({ layers: [] }),
    setPaintProperty: () => {},
    getSource: () => null,
    getLayer: () => null,
    addSource: () => {},
    addLayer: () => {},
    removeLayer: () => {},
    removeSource: () => {},
    fitBounds: () => {},
    /** Simule un changement de mode déclenché par l'utilisateur sur la carte. */
    emit: (event, payload) => {
      (listeners.get(event) || []).forEach((handler) => handler(payload));
    },
  };
  return { draw, map };
}

function render(mapRef, drawRef, features = []) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <DrawToolbar
        mapRef={mapRef}
        drawRef={drawRef}
        features={features}
        setFeatures={() => {}}
        onReset={() => {}}
      />
    );
  });
  return { container, root };
}

const button = (container, text) =>
  [...container.querySelectorAll("button")].find((node) =>
    node.textContent.trim().startsWith(text)
  );

describe("DrawToolbar — état actif des outils", () => {
  let mounted;

  afterEach(() => {
    if (mounted) {
      act(() => mounted.root.unmount());
      mounted.container.remove();
      mounted = null;
    }
  });

  it("colore le bouton Dessin dès son activation", () => {
    const { draw, map } = makeDrawStub();
    mounted = render({ current: map }, { current: draw });

    const dessin = button(mounted.container, "Dessin");
    expect(dessin.className).not.toContain("fp-btn--primary");

    act(() => dessin.click());

    expect(draw.changeMode).toHaveBeenCalledWith("draw_polygon");
    expect(button(mounted.container, "Dessin").className).toContain("fp-btn--primary");
  });

  it("désactive le dessin au second clic", () => {
    const { draw, map } = makeDrawStub();
    mounted = render({ current: map }, { current: draw });

    act(() => button(mounted.container, "Dessin").click());
    act(() => button(mounted.container, "Dessin").click());

    expect(draw.changeMode).toHaveBeenLastCalledWith("simple_select");
    expect(button(mounted.container, "Dessin").className).not.toContain("fp-btn--primary");
  });

  it("bascule la multi-sélection dans les deux sens", () => {
    const { draw, map } = makeDrawStub();
    mounted = render({ current: map }, { current: draw });

    act(() => button(mounted.container, "Multi-sélection").click());
    expect(draw.changeMode).toHaveBeenLastCalledWith("multiple_selection");
    expect(button(mounted.container, "Multi-sélection").className).toContain("fp-btn--primary");

    act(() => button(mounted.container, "Multi-sélection").click());
    expect(draw.changeMode).toHaveBeenLastCalledWith("simple_select");
    expect(button(mounted.container, "Multi-sélection").className).not.toContain(
      "fp-btn--primary"
    );
  });

  it("suit aussi les changements de mode venus de la carte", () => {
    const { draw, map } = makeDrawStub();
    mounted = render({ current: map }, { current: draw });

    act(() => map.emit("draw.modechange", { mode: "draw_polygon" }));
    expect(button(mounted.container, "Dessin").className).toContain("fp-btn--primary");

    // Fin du tracé : Draw revient de lui-même en simple_select.
    act(() => map.emit("draw.create", {}));
    expect(button(mounted.container, "Dessin").className).not.toContain("fp-btn--primary");
  });
});
