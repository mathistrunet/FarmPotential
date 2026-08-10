/**
 * Barre d'application commune aux deux modes.
 * Elle réunit ce qu'un utilisateur cherche en premier : le nom de l'outil, le
 * choix du mode, les actions principales (import / export) et l'accès au guide.
 */
export default function AppTopBar({
  mode = "editor",
  onModeChange,
  onOpenGuide,
  parcelCount = null,
  children,
}) {
  return (
    <header className="fp-topbar">
      <div className="fp-topbar__brand">
        <h1 className="fp-topbar__title">FarmPotential</h1>
        <span className="fp-topbar__subtitle">Parcellaire</span>
      </div>

      <div className="fp-segmented" role="group" aria-label="Mode d'affichage">
        <button
          type="button"
          aria-pressed={mode === "editor"}
          onClick={() => onModeChange?.("editor")}
          title="Importer, dessiner et compléter les parcelles"
        >
          Édition
        </button>
        <button
          type="button"
          aria-pressed={mode === "viewer"}
          onClick={() => onModeChange?.("viewer")}
          title="Visualiser l'assolement par année et par culture"
        >
          Visualisation
        </button>
      </div>

      {parcelCount != null ? (
        <span className="fp-badge" title="Nombre de parcelles dans le parcellaire courant">
          {parcelCount} parcelle{parcelCount > 1 ? "s" : ""}
        </span>
      ) : null}

      <div className="fp-topbar__spacer" />

      {children}

      {children ? <div className="fp-topbar__divider" /> : null}

      <button
        type="button"
        className="fp-btn fp-btn--ghost"
        onClick={onOpenGuide}
        title="Ouvrir le guide d'utilisation"
      >
        <span aria-hidden="true">?</span> Guide
      </button>
    </header>
  );
}
