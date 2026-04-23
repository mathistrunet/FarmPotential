# FP-006 - Rapprochement inter-annees

- ID : `FP-006`
- Statut : `En cours d'optimisation`
- Priorite : `P1`

---

## Objectif utilisateur

Permettre a l'utilisateur de relier des parcelles provenant d'annees differentes afin de :
- conserver un suivi coherent de l'evolution du parcellaire dans le temps
- propager automatiquement l'historique culturel (precedent, N-1, N-2, etc.) lors d'une fusion
- supprimer proprement l'annee "entrante" (geometries + lignes tableau) apres validation

---

## Comportement attendu - Vue d'ensemble

### Etape 1 : Import d'un fichier XML

Lors de l'import d'un fichier XML via le bouton Telepac :

1. L'utilisateur choisit dans quelle **colonne culturale** le fichier sera affecte :
   - N+1, N, N-1, N-2, N-3, N-4, N-5 ou N-6
2. Les **cultures** presentes dans le XML sont ecrites uniquement dans la colonne choisie (ex. `cultureN`, `cultureN_1`, `cultureN_2`, etc.).
3. Les **parcelles** sont importees avec une metadonnee `annee` correspondant a la campagne du fichier (extraite du nom de fichier, des metadonnees XML, ou saisie par l'utilisateur).
4. Chaque feature recoit donc : `{ annee: 2023, cultureN_1: "BLE", ... }` si l'offset choisi est N-1.

### Etape 2 : Detection du besoin de rapprochement

Des que **plusieurs annees distinctes** sont presentes dans les parcelles chargees, et que des **geometries se superposent** entre ces annees, le rapprochement devient disponible.

- Le bouton "Associer les parcelles" s'active (minimum 2 annees detectees).
- L'utilisateur ouvre la fenetre de rapprochement.

### Etape 3 : Fenetre de rapprochement

La fenetre presente deux cotes :

- **Gauche (annee conservee)** : l'annee dont les **geometries seront gardees** dans le parcellaire final.
- **Droite (annee disparaissant)** : l'annee dont les **geometries et les lignes seront supprimees** apres validation.

L'utilisateur choisit explicitement quelle annee disparait et laquelle reste.

La fenetre contient :
- Deux cartes cote a cote affichant les parcelles des deux annees selectionnees.
- Un tableau de correspondances en dessous avec :
  - Les parcelles de l'annee "entrante" (droite) a faire correspondre avec des parcelles de l'annee "conservee" (gauche).
  - Des propositions automatiques de correspondance basees sur le taux de recouvrement geometrique (seuil : 95%).
  - La possibilite de modifier manuellement les correspondances avant validation.

### Etape 4 : Validation et effet sur la vue principale

Apres confirmation par l'utilisateur :

1. Les **donnees culturales** de l'annee disparaissant sont propagees dans les proprietes des parcelles de l'annee conservee (logique de fusion : l'ancienne culture devient `cultureN1`, l'ancien precedent devient `precedent_N2`, etc.). Les colonnes s'affichent **immediatement** dans l'editeur, sans besoin de recharger la page.
2. L'annee disparaissant est **entierement supprimee** :
   - Toutes ses **geometries** disparaissent de la carte.
   - Toutes ses **lignes** disparaissent du tableau parcellaire.
3. Seules restent les parcelles de l'annee conservee, enrichies de l'historique culturel de l'annee disparue.
4. L'etat est persiste (backend ou local selon disponibilite).

---

## Donnees d'entree

- Collection de parcelles multi-annees (chaque feature a une propriete `annee`)
- Offset de colonne choisi a l'import (determine `cultureN`, `cultureN_1`, etc.)
- Correspondances proposees ou corrigees manuellement dans l'interface

---

## Donnees produites

- Parcelles de l'annee conservee, enrichies des donnees culturales de l'annee disparue
- Suppression complete de toutes les features de l'annee disparue
- Collection persistee sur disque (ou en local si backend indisponible)

---

## Regles metier

| Regle | Detail |
|---|---|
| Annee gauche = annee conservee | Ses geometries restent, ses donnees sont enrichies |
| Annee droite = annee disparaissant | Ses geometries ET ses lignes disparaissent apres validation |
| Propagation culture | `culture`/`cultureN` ancienne → `cultureN1` nouvelle ; `cultureN1`/`precedent` ancienne → `precedent_N2` nouvelle |
| Seuil auto-match | 95% de recouvrement geometrique reciproque |
| Colonne a l'import | Determinee par l'utilisateur (N+1 a N-6) ; la culture est ecrite dans la cle correspondante |
| Metadonnee `annee` | Extraite du fichier XML ou saisie manuellement ; obligatoire pour le rapprochement |

---

## Technique

- Composant UI : `src/components/ParcelleMatchView.jsx`
- Algorithme de suggestion : `src/utils/parcelleMatching.js`
- Logique de fusion : `src/domain/parcelles/fusion.js`
- Integration editeur : `src/maps/parcelles/ParcellesEditorMap.jsx` (handlers `handleOpenParcelleMatch`, `handleValidateParcelleMatch`)
- Backend : `POST /api/parcelles/matching/validate` (`scripts/geojson-server.mjs`)
- Import XML : `src/Front/TelepacButton.jsx`

---

## Corrections recentes

### Propagation correcte de la culture en colonne N-1 (avril 2025)

**Probleme 1 — mauvais champ cible dans `fusion.js`**

`applyCorrespondencesAndMerge` ecrivait la culture de l'annee disparue dans le champ `precedent`. Ce champ n'etait pas reconnu par `ParcelleEditor` comme colonne N-1 (qui lit `cultureN1`, `cultureN_1`, `culture_prec`, `CULT_PREC`). Resultat : la culture propagee n'apparaissait jamais dans le tableau.

*Correction :* `DEFAULT_PRECEDENT_N1_FIELD` passe de `"precedent"` a `"cultureN1"` dans `src/domain/parcelles/fusion.js`.

**Probleme 2 — cache `typed` obsolete dans `ParcelleEditor.jsx`**

Meme avec le bon champ, l'UI ne se mettait pas a jour apres fusion. Le cache `typed` (valeurs affichees par colonne et par feature) preservait une valeur vide `""` calculee avant la fusion. La condition `== null` empeche la mise a jour car `"" != null`.

*Correction :* suppression du mecanisme `prune()` + guard `== null` dans le `useEffect` de reconstruction du cache. Le cache est desormais toujours integralement recalcule depuis les props lors d'une modification de features. La condition `hasRemovedIds = true` (positionnee lors de toute fusion) garantit que la reconstruction est declenchee.

### Impact

Apres validation d'un rapprochement, les colonnes N-1 (et N-2 le cas echeant) s'affichent immediatement dans l'editeur, sans refresh de la page.

---

## Limites actuelles / Points a corriger

- La fenetre de rapprochement doit clairement indiquer laquelle des deux annees va disparaitre (libelle explicite, pas seulement "gauche/droite").
- La strategie de fusion (quelle propriete va ou) merite d'etre plus explicite dans l'UI.

---

## Evolutions recommandees (backlog)

- Afficher le taux de similarite dans l'UI de suggestion
- Permettre des cas de split / merge de parcelles (1 ancienne → N nouvelles)
- Tracer les decisions de rapprochement dans un historique consultable
- Exposer les regles de similarite configurables par l'utilisateur

---

## Documentation utilisateur

1. Importer un fichier XML via "Telepac", choisir la colonne cible (ex. N-1).
2. Repeter pour chaque annee a charger.
3. Une fois plusieurs annees detectees, cliquer "Associer les parcelles".
4. Dans la fenetre :
   - Choisir a gauche l'annee dont les geometries sont **gardees**.
   - Choisir a droite l'annee dont les geometries **disparaissent**.
   - Verifier ou ajuster les correspondances.
   - Valider.
5. De retour sur la vue principale : seules les parcelles de l'annee conservee restent, avec l'historique culturel mis a jour.
