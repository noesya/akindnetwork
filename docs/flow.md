# Kind — Flux éditorial

Le flux éditorial — qui apparaît dans `/read`, ce qu'on voit en lisant une
lettre, ce qu'on saisit en écrivant. Ce document est la source de vérité ;
si un comportement change, on met cette page à jour avant.

## Trois objets

- **Lettre** — un texte signé, soit racine (pas d'objet), soit réponse
  (« à propos de » une autre lettre). C'est l'unité de publication. Une
  lettre a un titre seulement si elle est racine ; une réponse n'en a pas.
- **Réponse** — une lettre dont l'objet est une autre lettre. Sa
  hiérarchie est récursive : on peut répondre à une réponse.
- **Brouillon / En relecture / Publiée / Rejetée** — les états par
  lesquels passe une lettre. Seule une lettre publiée apparaît dans le
  flux de lecture des autres lecteurs.

## Ce qui apparaît dans le flux `/read`

Le flux est plus restrictif que « toutes les lettres publiées ». Une
lettre n'est listée dans le flux principal que si :

- elle **n'a pas d'objet** (= elle est racine, elle ouvre un fil), OU
- elle a **au moins une réponse** publiée (elle porte un sous-fil —
  c'est la règle « commentaire de commentaire »).

Une réponse-feuille (qui n'a elle-même pas de réponses) est invisible
dans le flux ; on ne la rencontre qu'en lisant sa lettre parente et en
ouvrant sa section « Réponses ».

Ce filtre vit dans `useLetters()` (`hooks/useLetters.ts`).

## Lire une lettre

La lecture suit toujours la même grille 3 colonnes :

```
[ qui   ] [ quoi (contenu) ] [ méta ]
```

- **Qui** — avatar et nom de l'auteur. Deux modes :
  - *Grand* en haut de page : avatar large, nom en grande serif dessous,
    bio en dessous.
  - *Compact* dès qu'on scrolle (au-delà d'environ 40 % de la fenêtre) :
    avatar petit, nom à côté en petites lettres sans-serif, bio masquée.
- **Quoi** — titre `<h1>` (racine seulement) puis le texte de la lettre.
- **Méta** — « Quand ? », « À propos ? » (= la lettre parente quand
  c'est une réponse), « Approuvée par », « Sources ».

### Les réponses dessous

Quand une lettre racine est lue, ses réponses publiées s'affichent
intégralement en dessous, séparées par un filet fin. Chaque réponse :

- garde la même grille 3 colonnes ;
- n'a **pas de titre** (le sujet est annoncé par la lettre du dessus) ;
- est en mode auteur compact en permanence ;
- a un corps de texte légèrement plus petit ;
- montre dans sa méta : Quand ?, Approuvée par, Sources — pas « À
  propos ? » (la lettre parente est juste au-dessus, inutile de la
  redire).

Sous chaque réponse, dans l'ordre :

1. **Bouton « Répondre à ce message »** — ouvre l'éditeur (`/write`) en
   pré-remplissant « À propos ? » avec le titre ou le début du texte de
   cette réponse (tronqué à 80 caractères).
2. **Lien « N réponses → »** — discret, en petits caractères, seulement
   si cette réponse a elle-même des enfants publiés. Mène vers
   `/read/<id>` où la réponse devient à son tour racine et où ses
   propres réponses apparaissent en dessous.

### Tout en bas : Contribuer

Sous le dernier message du fil, un filet pleine largeur puis un bouton
**Contribuer** centré. Il ouvre l'éditeur en pré-remplissant « À
propos ? » avec la lettre racine.

C'est l'invitation à étendre le fil principal, à distinguer du « Répondre
à ce message » qui cible une réponse particulière.

## Écrire une lettre

Même grille 3 colonnes que la lecture :

- **Qui** — l'auteur (mon avatar, mon nom, ma bio), même rendu que la
  colonne auteur en mode grand de la lecture.
- **Quoi** — saisie de la lettre :
  - *Titre* : champ texte. **Masqué quand on répond** — une réponse n'a
    pas de titre.
  - *Texte* : zone à lignes. Limite indicative à 500 mots, le compteur
    s'affiche sous les boutons.
  - *Boutons d'action* : Enregistrer en brouillon, Envoyer en
    relecture.
  - En dessous, dans la même colonne : les listes **Brouillons** et **En
    relecture** de l'auteur (côte à côte sur desktop, empilées sur
    mobile). Cliquer une entrée ouvre la lettre dans l'éditeur du
    dessus.
- **Méta** — la fiche de la lettre :
  - *Quand ?* — la date du jour (création) ou de la dernière
    modification.
  - *À propos ?* — pré-rempli quand on est arrivé via « Répondre » ou
    « Contribuer », sinon absent.
  - *Statut ?* — Brouillon, En relecture, Publiée ou Rejetée.
  - *Sources ?* — un champ texte multi-lignes, une URL par ligne.

## États d'une lettre

Une lettre suit ce cycle :

```
Brouillon  ──Envoyer en relecture──▶  En relecture
                                          │
                       2 approbations ◀───┤
                                  │       │
                                  ▼       └──▶ 2 rejets ──▶  Brouillon
                              Publiée                        (avec mémo
                                                              du rejet)
```

- *Brouillon* : visible seulement par l'auteur, modifiable, non listée
  dans le flux.
- *En relecture* : la lettre entre dans le pool global. Aucune
  pré-assignation : n'importe quel pair de Kind autre que l'auteur, qui
  n'a pas encore voté, peut la relire. La lettre apparaît en haut du
  flux de lecture de tous les pairs éligibles, jusqu'à ce que le seuil
  soit atteint. Ce modèle « à la volée » évite qu'une lettre reste
  bloquée parce que des relecteurs pré-désignés ne se reconnectent pas.
- *Publiée* : seuil d'approbation (2 voix) atteint. La lettre rentre
  dans le flux selon la règle topologique du début de ce document.
- *Brouillon (après rejet)* : seuil de rejet (2 voix) atteint. La
  lettre revient à l'auteur, accompagnée des commentaires des
  relecteurs. Une re-soumission verbatim est refusée — il faut éditer
  le texte pour pouvoir resoumettre.

Soumettre un brouillon compte dans le quota quotidien de l'auteur (17
actions par jour, comme les 17 syllabes d'un haïku). Approuver ou
rejeter en relecture sont gratuits.
