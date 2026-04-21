# FP-010 - Nommage automatique par toponymie

- ID : `FP-010`
- Statut : `Implante`
- Priorite : `P2`

## Objectif utilisateur

Attribuer rapidement des noms de parcelles a partir de la toponymie locale lorsque ces noms ne sont pas encore renseignes.

## Perimetre actuel

- recherche du departement et de la region toponymique
- chargement de points toponymiques
- recherche du point le plus proche
- attribution d'un nom resolu

## Attendus fonctionnels

- proposer un nom pertinent pour les parcelles non nommees
- ne pas ecraser des noms deja juges significatifs

## Donnees d'entree

- geometrie ou centroide de parcelle
- referentiels toponymiques

## Donnees produites

- `nom`
- `nom_parcelle`
- `nom_affiche`

## Technique

- hook : `src/features/useToponymieAutoNaming.js`
- service : `src/services/toponymie.js`

## Documentation utilisateur

- utiliser l'action de remplissage des noms
- relire les noms proposes

## Limites / dette

- attribution basee sur le point le plus proche
- nom parfois long ne correspondant pas à une utilisation terrain

## Evolutions recommandees
