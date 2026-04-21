# FP-003 - Edition des proprietes et cultures

- ID : `FP-003`
- Statut : `Implante`
- Priorite : `P1`

## Objectif utilisateur

Permettre la saisie, la correction et l'enrichissement des informations metier attachees a chaque parcelle.

## Perimetre actuel

- nom de parcelle
- ilot / numero
- exploitation, pacage, SIRET
- type de sol
- bio / conduite bio
- cultures de `N+1` a `N-6`
- options avancees de culture
- autocompletion codes/libelles
- remplissage via RPG

## Attendus fonctionnels

- les champs doivent etre modifiables sans perte de donnees
- les cultures doivent accepter code et libelle
- les incoherences de saisie doivent etre visibles

## Donnees d'entree

- saisie utilisateur
- referentiel cultures
- donnees RPG

## Donnees produites

- proprietes de parcelles enrichies
- historiques culturaux exploitables a l'export

## Technique

- composant principal : `src/components/ParcelleEditor.jsx`
- services : `src/services/rpg.js`
- referentiels : codebook / colorbook / cultures Assolia

## Documentation utilisateur

- edition en vue cartes ou tableau
- boutons `Remplir` pour les cultures et nom de parcelle

## Limites / dette

## Evolutions recommandees

- normaliser strictement les proprietes de culture
- mieux encadrer les precedents culturaux au-dela du `N-2`