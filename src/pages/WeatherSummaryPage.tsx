import type { CSSProperties } from 'react';
import WeatherAnalysisPanel from '../features/weatherAnalysis/WeatherAnalysisPanel';

interface SummaryContext {
  centroid?: { latitude: number; longitude: number } | null;
  parcelLabel?: string;
}

interface WeatherSummaryPageProps {
  onReturn: () => void;
  context?: SummaryContext | null;
}

export default function WeatherSummaryPage({ onReturn, context }: WeatherSummaryPageProps) {
  const lat = context?.centroid?.latitude ?? null;
  const lon = context?.centroid?.longitude ?? null;

  const containerStyle: CSSProperties = {
    minHeight: '100dvh',
    background: 'linear-gradient(180deg,#f8fafc 0%,#e2e8f0 100%)',
    padding: '32px clamp(16px, 5vw, 64px)',
  };

  const cardStyle: CSSProperties = {
    maxWidth: 1024,
    margin: '0 auto',
    background: '#ffffff',
    borderRadius: 24,
    padding: '32px clamp(24px, 4vw, 56px)',
    boxShadow: '0 32px 90px rgba(15,23,42,0.12)',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  };

  const returnButtonStyle: CSSProperties = {
    alignSelf: 'flex-start',
    padding: '10px 18px',
    borderRadius: 12,
    border: '1px solid #0ea5e9',
    background: '#0ea5e9',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 14,
    boxShadow: '0 12px 30px rgba(14,165,233,0.25)',
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <button type="button" onClick={onReturn} style={returnButtonStyle}>
          Retourner à la carte
        </button>
        <WeatherAnalysisPanel lat={lat} lon={lon} parcelLabel={context?.parcelLabel} />
      </div>
    </div>
  );
}
