import { useEffect, useRef } from "react";

/**
 * Fenêtre modale générique : voile plein écran, fermeture par Échap, par clic sur
 * le voile ou par la croix. Le contenu défile à l'intérieur, jamais la page.
 */
export default function Modal({
  open = true,
  title,
  subtitle,
  onClose,
  footer,
  width,
  children,
}) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fp-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={cardRef}
        className="fp-modal"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        style={width ? { width: `min(${width}px, 100%)` } : undefined}
      >
        {title ? (
          <div className="fp-modal__header">
            <div>
              <h2 className="fp-modal__title">{title}</h2>
              {subtitle ? (
                <p className="fp-hint" style={{ marginTop: 4 }}>
                  {subtitle}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="fp-modal__close"
              onClick={onClose}
              aria-label="Fermer"
              title="Fermer (Échap)"
            >
              ×
            </button>
          </div>
        ) : null}

        <div className="fp-modal__body">{children}</div>

        {footer ? <div className="fp-modal__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
