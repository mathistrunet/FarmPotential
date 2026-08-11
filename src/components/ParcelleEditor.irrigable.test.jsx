// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// jsdom n'implémente pas createObjectURL, dont MapLibre a besoin au chargement
// (ParcelleEditor l'atteint indirectement via les couches RPG).
if (typeof window.URL.createObjectURL !== "function") {
  window.URL.createObjectURL = () => "blob:test";
  window.URL.revokeObjectURL = () => {};
}

const { default: ParcelleEditor } = await import("./ParcelleEditor");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const feature = (properties = {}) => ({
  type: "Feature",
  id: "p1",
  properties: { nom_parcelle: "P1", ...properties },
  geometry: {
    type: "Polygon",
    coordinates: [[[1.35, 44.01], [1.36, 44.01], [1.36, 44.02], [1.35, 44.01]]],
  },
});

/** Rend l'éditeur en vue Tableau et renvoie de quoi piloter le test. */
function renderTable(initialFeatures, { onSelect = () => {} } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const state = { features: initialFeatures };
  const setFeatures = vi.fn((updater) => {
    state.features = typeof updater === "function" ? updater(state.features) : updater;
    render();
  });

  function render() {
    act(() => {
      root.render(
        <ParcelleEditor
          features={state.features}
          visibleFeatures={state.features}
          setFeatures={setFeatures}
          viewMode="table"
          selectedId={null}
          onSelect={onSelect}
          drawRef={{ current: null }}
          mapRef={{ current: null }}
        />
      );
    });
  }

  render();
  return { container, root, state, setFeatures };
}

/** Case à cocher d'une colonne, repérée par le libellé qui la suit. */
function checkboxLabelled(container, text) {
  const label = [...container.querySelectorAll("td label")].find(
    (node) => node.textContent.trim() === text
  );
  return label?.querySelector("input[type=checkbox]") ?? null;
}

describe("ParcelleEditor — vue Tableau, cases Bio et Irrigable", () => {
  let cleanup;

  beforeEach(() => {
    cleanup = null;
  });

  afterEach(() => {
    if (cleanup) {
      act(() => cleanup.root.unmount());
      cleanup.container.remove();
    }
  });

  it("affiche une case Irrigable par parcelle", () => {
    cleanup = renderTable([feature()]);
    expect(checkboxLabelled(cleanup.container, "Irr.")).not.toBeNull();
  });

  it("coche l'irrigabilité et la conserve après re-rendu", () => {
    cleanup = renderTable([feature()]);
    const box = checkboxLabelled(cleanup.container, "Irr.");
    expect(box.checked).toBe(false);

    act(() => {
      box.click();
    });

    // La propriété est bien posée…
    expect(cleanup.state.features[0].properties.irrigable).toBe(true);
    // …et la case reste cochée après le re-rendu (pas de retour à l'état initial).
    expect(checkboxLabelled(cleanup.container, "Irr.").checked).toBe(true);
  });

  it("décoche l'irrigabilité", () => {
    cleanup = renderTable([feature({ irrigable: true, IRRIGABLE: true })]);
    const box = checkboxLabelled(cleanup.container, "Irr.");
    expect(box.checked).toBe(true);

    act(() => {
      box.click();
    });

    expect(cleanup.state.features[0].properties.irrigable).toBeUndefined();
    expect(checkboxLabelled(cleanup.container, "Irr.").checked).toBe(false);
  });

  it("relit une irrigabilité venue d'un import CSV (« oui » / « non »)", () => {
    cleanup = renderTable([feature({ irrigable: "oui" })]);
    expect(checkboxLabelled(cleanup.container, "Irr.").checked).toBe(true);

    act(() => cleanup.root.unmount());
    cleanup.container.remove();

    cleanup = renderTable([feature({ irrigable: "non" })]);
    expect(checkboxLabelled(cleanup.container, "Irr.").checked).toBe(false);
  });

  it("ne sélectionne pas la parcelle quand on coche depuis la cellule", () => {
    // La ligne du tableau sélectionne la parcelle sur la carte (recadrage +
    // changement de mode Draw). Un clic sur la case — ou à côté, sur le libellé —
    // ne doit pas déclencher cette sélection : c'est ce qui faisait clignoter la case.
    const onSelect = vi.fn();
    cleanup = renderTable([feature()], { onSelect });

    const label = [...cleanup.container.querySelectorAll("td label")].find(
      (node) => node.textContent.trim() === "Irr."
    );

    act(() => {
      label.querySelector("input").click();
    });
    act(() => {
      label.querySelector("span").click();
    });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("sélectionne toujours la parcelle depuis une cellule ordinaire", () => {
    const onSelect = vi.fn();
    cleanup = renderTable([feature()], { onSelect });
    const surfaceCell = cleanup.container.querySelectorAll("tbody td")[2];

    act(() => {
      surfaceCell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalled();
  });

  it("relit la conduite bio d'un CSV importé et la réécrit pour l'export", () => {
    // L'import CSV pose « parcelle_bio », l'export CSV relit cette même clé :
    // la case doit refléter l'une et alimenter l'autre, sans quoi la conduite
    // bio se perd à chaque aller-retour.
    cleanup = renderTable([feature({ parcelle_bio: "oui" })]);
    expect(checkboxLabelled(cleanup.container, "AB").checked).toBe(true);

    act(() => {
      checkboxLabelled(cleanup.container, "AB").click();
    });
    expect(checkboxLabelled(cleanup.container, "AB").checked).toBe(false);
    expect(cleanup.state.features[0].properties.parcelle_bio).toBeUndefined();

    act(() => {
      checkboxLabelled(cleanup.container, "AB").click();
    });
    const props = cleanup.state.features[0].properties;
    expect(props.conduite_bio).toBe(true);
    expect(props.parcelle_bio).toBeTruthy();
  });

  it("garde Bio et Irrigable indépendants", () => {
    cleanup = renderTable([feature()]);

    act(() => {
      checkboxLabelled(cleanup.container, "Irr.").click();
    });
    expect(checkboxLabelled(cleanup.container, "AB").checked).toBe(false);

    act(() => {
      checkboxLabelled(cleanup.container, "AB").click();
    });
    expect(checkboxLabelled(cleanup.container, "Irr.").checked).toBe(true);
    expect(checkboxLabelled(cleanup.container, "AB").checked).toBe(true);
  });
});
