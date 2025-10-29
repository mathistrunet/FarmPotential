import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import WeatherAnalysisPanel from '../features/weatherAnalysis/WeatherAnalysisPanel';

interface SummaryContext {
  centroid?: { latitude: number; longitude: number } | null;
  parcelLabel?: string;
}

interface WeatherSummaryModalProps {
  open: boolean;
  onClose: () => void;
  context?: SummaryContext | null;
}

export default function WeatherSummaryModal({ open, onClose, context }: WeatherSummaryModalProps) {
  if (!open) {
    return null;
  }

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    zIndex: 110,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  };

  const cardStyle: CSSProperties = {
    width: 'min(1080px, 100%)',
    maxHeight: '100%',
    background: '#ffffff',
    borderRadius: 24,
    boxShadow: '0 32px 90px rgba(15,23,42,0.25)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const contentStyle: CSSProperties = {
    padding: '32px clamp(24px, 4vw, 56px)',
    overflowY: 'auto',
  };

  const closeButtonStyle: CSSProperties = {
    border: 'none',
    background: '#e2e8f0',
    borderRadius: 999,
    width: 38,
    height: 38,
    fontSize: 18,
    cursor: 'pointer',
    color: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const headerStyle: CSSProperties = {
    padding: '24px clamp(28px, 4vw, 56px) 0',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  };

  return createPortal(
    <div role="dialog" aria-modal="true" style={overlayStyle}>
      <div style={cardStyle}>
        <header style={headerStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>Synthèse météo</h2>
            {context?.parcelLabel ? (
              <p style={{ margin: 0, fontSize: 14, color: '#475569' }}>
                Parcelle : {context.parcelLabel}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={closeButtonStyle}>
            ×
          </button>
        </header>
        <div style={contentStyle}>
          <WeatherAnalysisPanel
            lat={context?.centroid?.latitude ?? null}
            lon={context?.centroid?.longitude ?? null}
            parcelLabel={context?.parcelLabel}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
