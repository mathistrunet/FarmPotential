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
        <strong>Exporter</strong> propose trois sorties : le <strong>CSV Assolia</strong>{" "}
        (assolement prêt à importer), le <strong>XML Télépac</strong> (fichier de
        déclaration) et le <strong>shapefile</strong> (.zip pour un SIG). Une fenêtre
        demande les quelques informations nécessaires avant le téléchargement.
      </>
    ),
  },
];

// Colonnes du CSV Assolia, dans l'ordre du fichier généré.
const CSV_COLUMNS = [
  ["Secteur", "Saisi dans la fenêtre d'export, identique pour toutes les parcelles."],
  ["Exploitation", "Saisi dans la fenêtre d'export. Donne aussi son nom au fichier téléchargé."],
  ["Numero pacage", "Saisi dans la fenêtre d'export ; pré-rempli depuis un import Télépac."],
  ["Parcelles", "Nom de la parcelle. À défaut : « Parcelle 1 », « Parcelle 2 »…"],
  ["Surface parcelle", "En hectares, calculée depuis la géométrie si elle n'est pas renseignée."],
  ["Parcelle Bio", "« Oui » si la case AB est cochée, « Non » sinon."],
  ["Type de sol", "Texte saisi librement, éventuellement renommé à l'export."],
  ["Irrigabilité", "« Oui » si la case Irrigable est cochée, « Non » sinon."],
  ["CultureN à CultureN4", "Cultures de l'année en cours puis des quatre précédentes."],
  ["Geometrie", "Contour de la parcelle en longitude/latitude (WGS84)."],
];

const CSV_RULES = [
  {
    label: "Cultures et nom de structure",
    text: "Si vous renseignez un nom de structure, chaque culture est traduite en libellé de cette structure. Une culture sans correspondance devient « Autre assolé » ; une case vide reste vide (pas de culture cette année-là). Sans nom de structure, les libellés sont exportés tels quels.",
  },
  {
    label: "Colonnes N-5 et N-6",
    text: "Le CSV Assolia s'arrête à N-4. Les cultures saisies en N-5 et N-6 restent dans l'outil mais ne sont pas exportées.",
  },
  {
    label: "Type de sol",
    text: "La fenêtre d'export permet de renommer chaque type de sol rencontré, et d'attribuer une valeur commune aux parcelles qui n'en ont pas. Un champ laissé vide conserve la valeur d'origine.",
  },
  {
    label: "Format du fichier",
    text: "Séparateur point-virgule, une ligne d'en-tête, une ligne par parcelle. Les parcelles sans contour exploitable sont ignorées.",
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
  {
    label: "Aller-retour CSV",
    text: "Un CSV exporté peut être réimporté dans l'outil : nom, surface, bio, irrigabilité, type de sol, cultures et contours sont relus tels quels.",
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

      <div style={{ marginTop: 20 }}>
        <h3 className="fp-section-title">Ce que contient l'export CSV Assolia</h3>
        <p className="fp-hint" style={{ margin: "8px 0 10px" }}>
          Une ligne par parcelle, dans cet ordre de colonnes :
        </p>
        <div
          style={{
            border: "1px solid var(--c-border)",
            borderRadius: "var(--r-md)",
            overflow: "hidden",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "var(--fs-sm)",
              tableLayout: "fixed",
            }}
          >
            <tbody>
              {CSV_COLUMNS.map(([column, description], index) => (
                <tr
                  key={column}
                  style={{ background: index % 2 ? "var(--c-surface-muted)" : "transparent" }}
                >
                  <th
                    style={{
                      textAlign: "left",
                      verticalAlign: "top",
                      padding: "6px 10px",
                      width: "38%",
                      fontWeight: 600,
                      wordBreak: "break-word",
                    }}
                  >
                    {column}
                  </th>
                  <td
                    style={{
                      padding: "6px 10px",
                      color: "var(--c-text-soft)",
                      lineHeight: 1.5,
                    }}
                  >
                    {description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {CSV_RULES.map((rule) => (
            <div key={rule.label} className="fp-card" style={{ padding: 12 }}>
              <div style={{ fontSize: "var(--fs-md)", fontWeight: 700, marginBottom: 3 }}>
                {rule.label}
              </div>
              <p className="fp-hint">{rule.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
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
