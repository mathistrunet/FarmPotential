import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import WeatherAnalysisPanel from '../features/weatherAnalysis/WeatherAnalysisPanel';
import type { WeatherHistorySelection } from '../features/weatherAnalysis/types';

interface SummaryContext {
  centroid?: { latitude: number; longitude: number } | null;
  parcelLabel?: string;
  historySelection?: WeatherHistorySelection | null;
}

interface WeatherSummaryModalProps {
  open: boolean;
  onClose: () => void;
  context?: SummaryContext | null;
  onOpenHistory?: () => void;
}

export default function WeatherSummaryModal({ open, onClose, context, onOpenHistory }: WeatherSummaryModalProps) {
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
    padding: '24px clamp(28px, 4vw, 56px) 16px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  };

  const tabsContainerStyle: CSSProperties = {
    display: 'flex',
    gap: 4,
    background: '#e2e8f0',
    padding: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  };

  const activeTabStyle: CSSProperties = {
    padding: '10px 18px',
    borderRadius: 999,
    border: 'none',
    background: '#0ea5e9',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'default',
  };

  const inactiveTabStyle: CSSProperties = {
    padding: '10px 18px',
    borderRadius: 999,
    border: 'none',
    background: '#fff',
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };

  return createPortal(
    <div role="dialog" aria-modal="true" style={overlayStyle}>
      <div style={cardStyle}>
        <header style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
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
          </div>
          <nav style={tabsContainerStyle}>
            <button
              type="button"
              onClick={onOpenHistory}
              style={
                onOpenHistory
                  ? inactiveTabStyle
                  : { ...inactiveTabStyle, cursor: 'not-allowed', opacity: 0.6 }
              }
              aria-label="Afficher l'historique météo"
              disabled={!onOpenHistory}
            >
              Historique météo
            </button>
            <button type="button" style={activeTabStyle} disabled aria-current="page">
              Synthèse météo
            </button>
          </nav>
        </header>
        <div style={contentStyle}>
          <WeatherAnalysisPanel
            lat={context?.centroid?.latitude ?? null}
            lon={context?.centroid?.longitude ?? null}
            parcelLabel={context?.parcelLabel}
            historySelection={context?.historySelection ?? null}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
