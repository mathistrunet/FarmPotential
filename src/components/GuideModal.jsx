import Modal from "./Modal";
import { IMPORT_FORMATS } from "../services/parcellaireImport";

const STEPS = [
  {
    title: "1 · Charger votre parcellaire",
    text: (
      <>
        Cliquez sur <strong>Importer</strong> dans la barre du haut et choisissez votre
        fichier. L'outil détecte seul le format et recale les coordonnées en WGS84.
        Aucun fichier n'est envoyé sur Internet : tout reste sur votre poste.
      </>
    ),
  },
  {
    title: "2 · Corriger les contours",
    text: (
      <>
        Les outils de dessin sont regroupés en bas de l'écran :{" "}
        <strong>dessiner</strong> une parcelle manquante, <strong>découper</strong> une
        parcelle en deux, <strong>fusionner</strong> plusieurs parcelles ou{" "}
        <strong>supprimer</strong> la sélection. Cliquez une parcelle sur la carte pour la
        sélectionner ; les parcelles qui se chevauchent sont signalées en rouge.
      </>
    ),
  },
  {
    title: "3 · Renseigner les informations",
    text: (
      <>
        Le panneau de droite liste vos parcelles. En vue <strong>Fiches</strong> vous
        remplissez une parcelle à la fois, en vue <strong>Tableau</strong> vous saisissez en
        série (nom, surface, conduite AB, cultures N à N-6, type de sol). Les cultures se
        saisissent par nom ou par code Télépac, avec autocomplétion.
      </>
    ),
  },
  {
    title: "4 · Exporter le résultat",
    text: (
      <>
        <strong>Exporter</strong> propose deux sorties : le <strong>CSV Assolia</strong>{" "}
        (assolement prêt à importer, avec secteur / exploitation / code) et le{" "}
        <strong>XML Télépac</strong> (fichier de déclaration). Un export shapefile est
        également disponible depuis la fiche d'export.
      </>
    ),
  },
];

const TIPS = [
  {
    label: "Sauvegarde",
    text: "Vos modifications sont enregistrées automatiquement sur votre poste : vous pouvez fermer et rouvrir l'outil sans rien perdre. « Réinitialiser » efface tout le parcellaire courant.",
  },
  {
    label: "Plusieurs millésimes",
    text: "Importez plusieurs fichiers d'années différentes : chaque parcelle porte son année. Le filtre « Année » du panneau et l'outil « Associer les parcelles » permettent de faire correspondre les millésimes.",
  },
  {
    label: "Fonds de carte",
    text: "L'onglet Calques active le fond satellite, le plan IGN, le RPG et les autres couches d'aide au repérage. Un clic sur la carte affiche les informations des couches interrogeables.",
  },
  {
    label: "Type de sol",
    text: "Dans cette version, le type de sol se saisit manuellement (colonne « Type de sol »). La déduction automatique depuis les cartes pédologiques n'est pas activée.",
  },
];

export default function GuideModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      title="Comment fonctionne l'outil"
      subtitle="Importer un parcellaire, le corriger, le compléter, puis l'exporter. Quatre étapes, dans cet ordre."
      onClose={onClose}
      width={780}
      footer={
        <>
          <span className="fp-hint">
            Ce guide reste accessible à tout moment via le bouton{" "}
            <strong>Guide</strong> en haut à droite.
          </span>
          <button
            type="button"
            className="fp-btn fp-btn--primary"
            style={{ marginLeft: "auto" }}
            onClick={onClose}
          >
            J'ai compris
          </button>
        </>
      }
    >
      <ol className="fp-steps">
        {STEPS.map((step, index) => (
          <li key={step.title} className="fp-step">
            <span className="fp-step__num">{index + 1}</span>
            <div>
              <h3 className="fp-step__title">{step.title.replace(/^\d+ · /, "")}</h3>
              <p className="fp-step__text">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="fp-card fp-card--muted" style={{ marginTop: 20 }}>
        <h3 className="fp-section-title">Formats de parcellaire acceptés</h3>
        <div className="fp-format-list" style={{ justifyContent: "flex-start" }}>
          {IMPORT_FORMATS.map((format) => (
            <span key={format.label} className="fp-badge" title={format.description}>
              {format.label}
            </span>
          ))}
        </div>
        <p className="fp-hint" style={{ marginTop: 10 }}>
          Un shapefile peut être fourni zippé ou sous forme de dossier contenant les
          fichiers .shp, .dbf, .shx et .prj.
        </p>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        <h3 className="fp-section-title">Bon à savoir</h3>
        {TIPS.map((tip) => (
          <div key={tip.label} className="fp-card" style={{ padding: 12 }}>
            <div style={{ fontSize: "var(--fs-md)", fontWeight: 700, marginBottom: 3 }}>
              {tip.label}
            </div>
            <p className="fp-hint">{tip.text}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
