/**
 * Signale qu'une version plus récente des cartes est disponible.
 *
 * Purement présentationnel : l'état vient de useLayerUpdates, porté par
 * l'éditeur. Le composant reste muet quand tout est à jour ou que la
 * vérification n'a pas abouti — une carte peut-être périmée ne justifie pas
 * d'alarmer l'utilisateur, l'application fonctionne de toute façon.
 */
export default function LayerUpdateNotice({ report, pending, applying, appliedCount, onApply }) {
  if (appliedCount != null && pending === 0) {
    return (
      <div
        className="fp-card"
        style={{ padding: 12, borderColor: "var(--c-accent-border)", background: "var(--c-accent-soft)" }}
      >
        <p className="fp-hint" style={{ color: "var(--c-accent-hover)" }}>
          {appliedCount === 0
            ? "Les cartes étaient déjà à jour."
            : `${appliedCount} carte${appliedCount > 1 ? "s" : ""} mise${appliedCount > 1 ? "s" : ""} à jour : la nouvelle version sera récupérée au prochain affichage.`}
        </p>
      </div>
    );
  }

  if (!report || pending === 0) return null;

  const { outdated = [], added = [] } = report;
  const totalMo =
    [...outdated, ...added].reduce((sum, layer) => sum + (layer.size || 0), 0) / 1048576;

  return (
    <div
      className="fp-card"
      style={{ padding: 12, borderColor: "var(--c-warn-border)", background: "var(--c-warn-soft)" }}
    >
      <div style={{ fontSize: "var(--fs-md)", fontWeight: 700, color: "var(--c-warn)" }}>
        Mise à jour des cartes disponible
      </div>

      <p className="fp-hint" style={{ marginTop: 4 }}>
        {outdated.length > 0 ? (
          <>
            {outdated.length} carte{outdated.length > 1 ? "s" : ""} de votre poste{" "}
            {outdated.length > 1 ? "ont" : "a"} été corrigée{outdated.length > 1 ? "s" : ""} depuis
            son téléchargement.{" "}
          </>
        ) : null}
        {added.length > 0 ? (
          <>
            {added.length} nouvelle{added.length > 1 ? "s" : ""} carte{added.length > 1 ? "s" : ""}{" "}
            {added.length > 1 ? "sont disponibles" : "est disponible"} ; elle
            {added.length > 1 ? "s seront récupérées" : " sera récupérée"} automatiquement au
            besoin.
          </>
        ) : null}
      </p>

      {outdated.length > 0 ? (
        <ul
          style={{
            margin: "8px 0 0",
            paddingLeft: 18,
            fontSize: "var(--fs-sm)",
            color: "var(--c-text-soft)",
          }}
        >
          {outdated.slice(0, 4).map((layer) => (
            <li key={`${layer.dataset}/${layer.name}`}>{layer.name}</li>
          ))}
          {outdated.length > 4 ? <li>et {outdated.length - 4} autre(s)…</li> : null}
        </ul>
      ) : null}

      {outdated.length > 0 ? (
        <>
          <button
            type="button"
            className="fp-btn fp-btn--sm"
            style={{ marginTop: 10 }}
            onClick={onApply}
            disabled={applying}
            title="Écarte les copies périmées ; la version à jour sera reprise au prochain affichage"
          >
            {applying ? "Mise à jour…" : "Mettre à jour"}
          </button>
          <p className="fp-hint" style={{ marginTop: 6 }}>
            {totalMo >= 1 ? `~${totalMo.toFixed(0)} Mo` : "Quelques Mo"} seront retéléchargés, et
            uniquement pour les secteurs que vous consultez.
          </p>
        </>
      ) : null}
    </div>
  );
}
