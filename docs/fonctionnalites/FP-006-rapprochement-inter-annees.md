# FP-006 - Rapprochement inter-annees

- ID : `FP-006`
- Statut : `Implante`
- Priorite : `P1`

## Objectif utilisateur

Relier les parcelles d'annees differentes pour conserver une lecture coherente des evolutions de parcellaire.

## Perimetre actuel

- choix de deux annees
- affichage comparatif sur deux cartes
- suggestions automatiques
- ajustement manuel
- validation backend

## Attendus fonctionnels

- l'utilisateur doit pouvoir confirmer ou corriger les rapprochements
- les donnees inter-annees doivent rester coherentes apres validation

## Donnees d'entree

- collection de parcelles multi-annees
- correspondances proposees ou corrigees

## Donnees produites

- correspondances validees
- fusion logique backend selon la strategie en place

## Technique

- composant : `src/components/ParcelleMatchView.jsx`
- backend : `/api/parcelles/matching/validate`
- logique metier : `src/domain/parcelles/fusion.js`

## Documentation utilisateur

- ouvrir l'outil d'association depuis l'onglet parcelles
- verifier les propositions
- valider les correspondances

## Limites / dette

- la strategie de fusion merite d'etre formalisee plus explicitement
- besoin de tracer davantage les decisions de rapprochement

## Evolutions recommandees

- exposer les regles de similarite dans l'UI
- ajouter des cas de split / merge plus explicites

