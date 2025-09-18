
export default function WeatherSummaryPage({ onReturn }) {
  const handleReturn = typeof onReturn === "function" ? onReturn : () => {};


  const containerStyle = {
    minHeight: "100dvh",
    background: "linear-gradient(180deg,#f8fafc 0%,#e2e8f0 100%)",
    padding: "32px clamp(16px, 5vw, 64px)",
  };

  const cardStyle = {
    maxWidth: 860,
    margin: "0 auto",
    background: "#ffffff",
    borderRadius: 24,
    padding: "36px clamp(24px, 4vw, 56px)",
    boxShadow: "0 32px 90px rgba(15,23,42,0.15)",
    display: "flex",
    flexDirection: "column",
    gap: 28,
    color: "#0f172a",
  };

  const badgeStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 14px",
    borderRadius: 999,
    background: "#e0f2fe",
    color: "#0369a1",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  };

  const returnButtonStyle = {
    alignSelf: "flex-start",
    padding: "10px 18px",
    borderRadius: 12,
    border: "1px solid #0ea5e9",
    background: "#0ea5e9",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
    boxShadow: "0 12px 30px rgba(14,165,233,0.25)",
  };

  const placeholderStyle = {
    borderRadius: 18,
    border: "1px dashed #cbd5f5",
    padding: "24px",
    background: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    color: "#1e293b",
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <span style={badgeStyle}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ display: "block" }}
          >
            <path
              d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm0 4.5a1.25 1.25 0 1 1-1.25 1.25A1.25 1.25 0 0 1 12 7.5Zm2 9h-4a.75.75 0 0 1 0-1.5h1v-3H11a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 .75.75v3.75H14a.75.75 0 0 1 0 1.5Z"
              fill="currentColor"
            />
          </svg>
          Synthèse météo
        </span>

        <div>
          <h1 style={{ margin: "12px 0 12px", fontSize: "clamp(26px, 4vw, 40px)" }}>
            Vue d&apos;ensemble des conditions météorologiques
          </h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "#334155" }}>
            Retrouvez ici, prochainement, une synthèse claire de toutes les
            observations météorologiques associées au point que vous aurez placé
            sur la carte. Cette page servira de tableau de bord dédié pour
            visualiser l&apos;historique et les tendances clés en un seul coup
            d&apos;œil.
          </p>
        </div>

        <div style={placeholderStyle}>
          <h2 style={{ margin: 0, fontSize: 18 }}>En préparation</h2>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
            Les données météo (températures, précipitations, vent...) viendront
            s&apos;afficher ici dès qu&apos;un point aura été sélectionné sur la carte.
            Nous y ajouterons :
          </p>
          <ul style={{ margin: 0, paddingLeft: 22, color: "#334155" }}>
            <li>Les relevés récents et historiques du point choisi.</li>
            <li>Des graphiques pour visualiser les tendances dans le temps.</li>
            <li>Des indicateurs clés pour faciliter la prise de décision.</li>
          </ul>
        </div>

        <button
          type="button"
          onClick={handleReturn}
          style={returnButtonStyle}
        >
          Retourner à la carte
        </button>
      </div>
    </div>
  );
}
