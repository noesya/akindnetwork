# Kind — Architecture

> A post-growth, peer-reviewed federated social network, built on ActivityPods.
>
> Statut : plan initial — 2026-06-06. Document vivant, à amender au fil des décisions.

---

## 1. Principes directeurs

Toutes les décisions doivent respecter les 9 contraintes Kind ([voir Figma](./Kind.pdf)). En cas de tension entre contrainte produit et confort technique, **la contrainte gagne**.

Trois règles d'architecture qui en découlent :

1. **Server-enforced first** — toute contrainte doit être imposée côté serveur. Le frontend peut aider l'UX mais ne doit jamais être l'unique gardien (17/jour, peer review, fenêtre horaire).
2. **Sémantique partout** — sources, auteurs, thèmes, approbations sont des **liens RDF**, jamais des chaînes libres. Kind est un graphe, pas un blob.
3. **Pas de feed** — l'API serveur ne doit pas exposer de timeline infinie. Le frontend ne sait afficher qu'**une** lettre à la fois.

---

## 2. Modèle de données

### 2.1 Ontologie `kind:`

Namespace : `https://kind.app/ns#`

Concepts à définir dans une ontologie custom (les autres sont réutilisés depuis AS2, Schema.org, DC, FOAF, ACL — déjà bundlés dans ActivityPods).

| Terme | Type | Description |
|---|---|---|
| `kind:Letter` | Class | Sous-classe de `as:Article` |
| `kind:Source` | Class | Référence citée (URL + métadonnées) |
| `kind:Circle` | Class | Cercle d'intérêt (mappé sur un `acl:Group`) |
| `kind:Approval` | Class | Acte d'approbation par un pair |
| `kind:status` | Property | Lettre → `kind:Draft` \| `kind:InReview` \| `kind:Published` (le rejet renvoie en `Draft`) |
| `kind:approvedBy` | Property | Lettre → WebID (un par approbation) |
| `kind:rejectedContentHash` | Property | Lettre → sha256 du contenu au moment du rejet. Bloque la resoumission tant que le contenu n'a pas changé |
| `kind:rejectionReason` | Property | Lettre → texte libre du rejet (visible par l'auteur) |
| ~~`kind:reviewThreshold`~~ | ~~Property~~ | Retiré 2026-06-06 — seuil fixé à 2 pour toute lettre, hardcodé dans `KindPeerReviewService` |
| `kind:respondsTo` | Property | Lettre → autre Lettre (chaîne de réponses) |
| `kind:sources` | Property | Lettre → liste de `kind:Source` |
| `kind:circle` | Property | Lettre → `kind:Circle` (audience) |
| `kind:circleOwner` | Property | Cercle → WebID du propriétaire (un seul). Transmissible via `kind-circles.transferOwnership` |
| `kind:theme` | Property | Lettre → URI de thème (concept SKOS) |

### 2.2 Vocabulaires réutilisés

- **Activity Streams 2.0** : `as:Article`, `as:Note`, `as:attributedTo`, `as:to`, `as:cc`, `as:published`
- **Schema.org** : `schema:citation`, `schema:author`, `schema:datePublished`, `schema:about`
- **Dublin Core** : `dc:language`, `dc:created`, `dc:modified`
- **FOAF** : `foaf:Person`, `foaf:img`, `foaf:name`
- **ACL** : `acl:agentGroup` (pour les cercles)
- **SKOS** : `skos:Concept` (pour les thèmes — taxonomy contrôlée si on veut)

### 2.3 Exemple JSON-LD d'une lettre publiée

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {
      "dc": "http://purl.org/dc/terms/",
      "schema": "http://schema.org/",
      "kind": "https://kind.app/ns#"
    }
  ],
  "id": "https://alice.kind.app/letters/we-need-night-trains",
  "type": ["Article", "kind:Letter"],
  "attributedTo": "https://alice.kind.app/",
  "name": "We need night trains!",
  "content": "Odio nibh eget nibh felis in...",
  "dc:language": "en",
  "dc:created": "2025-02-23T10:00:00Z",
  "published": "2025-02-25T14:00:00Z",
  "schema:about": "https://kind.app/themes/mobility",
  "kind:status": "kind:Published",
  "kind:respondsTo": "https://philippe.kind.app/letters/vision-train-network",
  "kind:approvedBy": [
    "https://lucie.kind.app/",
    "https://anton.kind.app/"
  ],
  "kind:circle": "https://alice.kind.app/circles/europe-mobility",
  "schema:citation": [
    {
      "type": "Link",
      "href": "https://metro.co.uk/2025/03/19/a-new-tube-europe-link...",
      "schema:name": "A new tube linking 39 European countries via train",
      "schema:publisher": "Metro"
    }
  ],
  "to": ["https://alice.kind.app/circles/europe-mobility"]
}
```

### 2.4 Shape trees

Un shape tree par concept majeur, dans `backend/shapetrees/kind/` :

- `Letter.ttl` — contraintes SHACL sur `kind:Letter`
- `Source.ttl` — contraintes sur `kind:Source`
- `Circle.ttl` — contraintes sur `kind:Circle`

L'app demande accès à ces shape trees au moment du consent (mécanisme Apps Access Grants d'ActivityPods 2.0).

---

## 3. Backend — services Moleculer custom

L'app ActivityPods de Kind est un node Moleculer qui s'enregistre auprès d'un Pod Provider. Architecture standard SemApps. On ajoute **3 services custom** + **1 middleware** + **1 ontologie** :

### 3.1 `KindPeerReviewService` (le service le plus stratégique)

Responsabilité : gérer le cycle de vie `Draft → InReview → Published` d'une lettre, gater la fédération.

Actions exposées :

- `submitDraft({ letterUri })` — passe `kind:status` de `Draft` à `InReview`. **N'appelle pas** `pod-outbox.post`. Refuse si `kind:rejectedContentHash` existe et matche le hash actuel du contenu (resoumission interdite sans modification, décision 2026-06-06).
- `approve({ letterUri, approverWebId })` — vérifie que l'approver est dans le cercle, ajoute à `kind:approvedBy`. Si `count >= 2` → appelle `_publish()`.
- `reject({ letterUri, approverWebId, reason })` — passe `kind:status` à `Draft`, stocke `kind:rejectedContentHash` (sha256 du contenu actuel) et `kind:rejectionReason`. Émet une notification (LDN) vers l'auteur.
- `_publish({ letterUri })` (interne) — appelle `pod-outbox.post` avec un `Create` activity contenant la lettre, audience `to` = membres du cercle.

Listening :
- Hook sur `ldp.resource.deleted` pour cleanup des approvals en cours

Stockage : tout en LDP dans le Pod de l'auteur, avec ACL serrée jusqu'à publication (visible uniquement par l'auteur + les reviewers désignés).

### 3.2 `KindRateLimitMiddleware`

Middleware Moleculer (`backend/middlewares/rate-limit.js`).

S'insère **uniquement** sur l'action `kind-peer-review.submitDraft` — décision produit du 2026-06-06 : seuls les actes d'envoi au public comptent (écrire ou répondre, indifféremment). Approuver, sauvegarder un draft, lire = 0 action.

Logique :
1. Lit `ctx.meta.webId`
2. Incrémente un compteur (Redis ou Moleculer cacher) avec clé `rate:${webId}:${YYYY-MM-DD}` et TTL 24h
3. Si > 17 → throw `MoleculerError("Daily limit reached", 429, "RATE_LIMIT")`

Configuration dans `moleculer.config.js` → `middlewares: [require('./middlewares/rate-limit')]`.

### 3.3 `KindSourceService`

Responsabilité : enrichir une `kind:Source` avec ses métadonnées (Open Graph / oEmbed).

Actions :
- `enrich({ url })` — fetch l'URL, extrait OG tags, retourne `{ title, author, publisher, image, description }`
- Stocke en cache pour éviter de re-fetcher la même URL

Sécurité : whitelist de domaines ou rate-limit serveur sortant (un user malveillant ne doit pas pouvoir faire fetcher 1000 URLs).

### 3.4 `KindTimeWindowMiddleware` (obligatoire)

Décision 2026-06-06 : on coupe l'écriture de **22h à 7h** dans le **fuseau horaire de l'auteur**. (Pas de mention du weekend dans la décision, gardons-le ouvert le weekend pour l'instant.)

- Lit `ctx.meta.webId` puis fetche `schema:timezone` du profil (fallback `Europe/Paris`)
- Calcule l'heure locale courante
- Si 22h ≤ heure < 7h → throw `MoleculerError("Service closed (22h–7h)", 503, "SERVICE_CLOSED")`
- S'applique sur `kind-peer-review.submitDraft`, `kind-peer-review.approve`, `kind-peer-review.reject`, mais aussi sur les sauvegardes de draft (`dataProvider.update` sur Letter) — sinon on contourne en sauvant un draft pendant la nuit
- Lecture (`dataProvider.getOne`, `getList`) toujours autorisée

À reconsidérer : ajouter une coupure weekend ? Décision pendante.

### 3.5 `KindCirclesService`

Décision 2026-06-06 : autogestion par le créateur. Pas de modération centrale.

Actions :
- `create({ name, description })` — crée un `kind:Circle`, pose `kind:circleOwner = ctx.meta.webId`, crée un groupe WAC (`PodWacGroupsService.create`).
- `invite({ circleUri, memberWebId })` — vérifie `ctx.meta.webId == kind:circleOwner`, ajoute le membre via `PodWacGroupsService.addMember`. Envoie une `Invite` activity AP à `memberWebId`.
- `removeMember({ circleUri, memberWebId })` — idem, retire.
- `transferOwnership({ circleUri, newOwnerWebId })` — vérifie owner actuel, vérifie que `newOwnerWebId` est déjà membre du cercle, change `kind:circleOwner`.
- `delete({ circleUri })` — owner uniquement. Détruit le groupe WAC. Les lettres déjà publiées restent accessibles à leurs `kind:approvedBy` mais perdent leur lien vers le cercle disparu.

### 3.6 Déclaration de l'ontologie

`backend/services/core/ontologies.js` ajoute :
```js
{ prefix: 'kind', url: 'https://kind.app/ns#', owl: '/path/to/kind.ttl' }
```

Fichier `backend/ontologies/kind.ttl` avec la définition OWL/RDFS de `kind:Letter`, `kind:Source`, etc.

---

## 4. Frontend — React custom + hooks SemApps

### 4.1 Stack

- **Vite** (pas Next.js — Kind n'a pas besoin de SSR, et CSR + SPA est suffisant)
- **React 18+**
- **React Router** pour le routing
- **SemApps packages bas niveau** :
  - `@semapps/auth-provider` — login Solid OIDC
  - `@semapps/semantic-data-provider` — fetch/save LDP resources
  - `@semapps/activitypub-components` — hooks `useOutbox`, `useInbox`
- **`react-i18next`** — bilingue FR/EN par défaut (décision 2026-06-06)
- **Pas de react-admin**, pas de Material-UI

### 4.2 Style

- Typographie : serif (Newsreader ou EB Garamond) pour le corps des lettres, sans-serif (Inter) pour le chrome
- Pas de framework CSS lourd — CSS modules ou vanilla-extract
- Palette : fond ivoire `#fefefe`, encarts saumon clair `#f5e8e6`, texte `#1a1a1a`, accents discrets

### 4.3 Routing

```
/                     → Accueil
/read                 → liste *minimale* des lettres reçues (1 par "page", navigation suivant/précédent)
/read/:letterId       → lettre + sidebar sources + thread de réponses
/write                → composer (vide)
/write/:draftId       → composer (édition d'un draft)
/about                → page statique
/me                   → profil + drafts + lettres en attente de review
/me/review/:letterId  → interface d'approbation pour un pair
/login                → Pod login
```

### 4.4 Composants principaux

```
src/
  components/
    Layout.tsx              # nav haute (Read/Write) + basse (About/Me)
    Letter.tsx              # rendu d'une lettre (lecture)
    LetterSidebar.tsx       # When? About? Approved by? Sources?
    LetterEditor.tsx        # composer 500 mots max, autosave draft
    SourceCard.tsx          # carte preview d'une source citée
    SourceModal.tsx         # modal grand format (cf. "It's Nice That" dans Figma)
    Thread.tsx              # liste des réponses sous la lettre
    DailyLimitBadge.tsx     # indicateur "5/17 actions aujourd'hui"
    ReviewQueue.tsx         # interface d'approbation pair
    CircleSelector.tsx      # choix de l'audience (cercle d'intérêt)
    LanguageSwitcher.tsx    # FR / EN, persiste dans le profil (`schema:knowsLanguage`)
    RejectionNotice.tsx     # bandeau sur un draft rejeté avec la raison + bouton "modifier"
    ClosedNotice.tsx        # écran 22h-7h "Kind est fermé jusqu'à 7h dans votre fuseau"
  pages/
    ReadPage.tsx
    WritePage.tsx
    MePage.tsx
    AboutPage.tsx
  hooks/
    useDailyLimit.ts        # wraps fetch /me/rate-status, cache 1min
    usePeerReview.ts        # actions submit/approve/reject
    useLetter.ts            # useGetOne wrapped
  lib/
    dataProvider.ts         # config SemApps semantic-data-provider
    authProvider.ts         # config SemApps auth-provider
```

### 4.5 Flux de données types

**Écrire une lettre :**
1. User clique "Write" → `LetterEditor` avec draft vide
2. Autosave (debounced 2s) → `dataProvider.update()` sur la ressource LDP draft (statut `kind:Draft`)
3. User clique "Envoyer en relecture" → appel `kind-peer-review.submitDraft` via outbox custom action
4. Status passe à `kind:InReview`, draft visible par les reviewers dans leur `/me/review`

**Lire une lettre :**
1. Route `/read/:letterId` → `useGetOne('Letter', letterId)`
2. Le data provider expand le JSON-LD : auteur (FOAF), sources (kind:Source), approvers (kind:approvedBy)
3. Rendu : `<Letter>` + `<LetterSidebar>` + `<Thread>`

**Approuver :**
1. Reviewer va sur `/me/review/:letterId`
2. Lit, clique "Approuver" → appel `kind-peer-review.approve`
3. Si seuil atteint → publication automatique → fédération AP

---

## 5. Architecture en 2 couches : Pod Provider ≠ App

**Point clé** (corrigé 2026-06-06) : dans ActivityPods, une app est **toujours** provider-agnostique. On ne déploie pas Kind "sur" un Pod Provider — on déploie Kind comme app autonome, et n'importe quel Pod Provider compatible peut s'y connecter.

```
Pod Provider (armoise.co, mutual-aid.app, votre serveur…)
    ↑ Solid LDP + ActivityPub
    │
App server Kind (kind.app — c'est ce qu'on déploie)
    ↑ HTTP
    │
Frontend Kind React (kind.app — c'est ce qu'on déploie)
```

### 5.1 Déclaration de l'app via `AppService`

Fichier `backend/services/app.service.js` :

```javascript
const { AppService } = require('@activitypods/app');

module.exports = {
  mixins: [AppService],
  settings: {
    app: {
      name: 'Kind',
      description: 'A post-growth, peer-reviewed federated social network',
      thumbnail: 'https://kind.app/logo192.png',
      frontUrl: 'https://kind.app'
    },
    oidc: {
      clientUri: 'https://kind.app',
      redirectUris: 'https://kind.app/auth-callback',
      postLogoutRedirectUris: 'https://kind.app/login?logout=true',
      tosUri: 'https://kind.app/terms'
    },
    accessNeeds: {
      required: [
        { shapeTreeUri: 'https://kind.app/shapetrees/Letter', accessMode: ['acl:Read', 'acl:Write'] },
        { shapeTreeUri: 'https://kind.app/shapetrees/Source', accessMode: ['acl:Read', 'acl:Write'] },
        { shapeTreeUri: 'https://kind.app/shapetrees/Circle', accessMode: ['acl:Read', 'acl:Write'] },
        'apods:ReadInbox',
        'apods:ReadOutbox',
        'apods:PostOutbox',
        'apods:CreateAclGroup'
      ]
    }
  }
};
```

Le mixin gère pour nous : exposition du manifest, OIDC Dynamic Registration, génération de l'écran de consentement, stockage des Apps Access Grants.

### 5.2 Le flux d'installation pour un utilisateur

1. Alice (compte existant sur armoise.co) visite **kind.app**, clique "Login"
2. Kind demande son WebID ou son Pod Provider → redirect OIDC vers armoise.co
3. armoise.co fetche le manifest de Kind, **affiche un écran de consentement** listant les access needs
4. Alice clique "Autoriser" → un Apps Access Grant est créé dans son Pod
5. Kind reçoit un token, peut lire/écrire `kind:Letter` etc. **dans le Pod d'Alice sur armoise.co**

### 5.3 Pod Provider : on en a un ou pas ?

C'est **une décision séparée** de "déployer Kind". Trois options :

- **A. Pas de Pod Provider Kind** — on demande aux users d'avoir déjà un Pod ailleurs (armoise.co, mutual-aid, autohébergé). Plus pur philosophiquement, onboarding plus rude.
- **B. Pod Provider Kind dédié** (`pod.kind.app`) — on offre l'inscription clé-en-main, on garde la philosophie "solar server" pour le hosting. Devops à porter.
- **C. Hybride** : dev sur armoise.co, prod sur `pod.kind.app` quand on lance vraiment.

**Reco actuelle** : C. En Phase 0-2, créer 2 comptes test sur armoise.co. En Phase 3+, monter `pod.kind.app` (Docker, fork du `pod-provider` officiel ActivityPods).

---

## 6. Plan de mise en œuvre — phases

### Phase 0 — Hello World (3-5 jours)
- Pod Provider local via Docker (`activitypods/pod-provider`)
- 2 comptes test (`alice`, `bob`)
- Squelette Vite + React, login Solid qui marche
- Page `/read` qui affiche "hello WebID"

**Critère de sortie** : alice se logge, voit son WebID.

### Phase 1 — Lettre & peer review (2 semaines)
- Ontologie `kind:` déclarée + shape trees
- Service `KindPeerReviewService` (sans fédération encore)
- Frontend : `LetterEditor`, `Letter`, `MePage` avec drafts
- Flow complet : alice écrit → soumet → bob approuve → publié dans le Pod d'alice

**Critère de sortie** : un cycle complet review/publish marche sur un seul Pod.

### Phase 2 — Sources & fédération (2 semaines)
- `KindSourceService` (OG / oEmbed)
- `SourceModal` frontend
- Publication via `pod-outbox.post` → fédération ActivityPub réelle entre 2 Pods
- Inbox côté lecteur (réceptionne les lettres fédérées)

**Critère de sortie** : alice@pod1 publie, bob@pod2 reçoit dans son inbox.

### Phase 3 — Rate limit & cercles (1 semaine)
- `KindRateLimitMiddleware` (17/jour)
- `DailyLimitBadge` frontend
- `PodWacGroupsService` branché : création/membership de cercles
- `CircleSelector` dans l'éditeur

**Critère de sortie** : limite serveur réelle, lettre visible uniquement dans son cercle.

### Phase 4 — Polish & idée board (à arbitrer)
À évaluer selon priorités :
- Typographic voices (choix de fonts par user)
- Controversy mapping (visualisation graphe)
- Closed at night & weekends (middleware optionnel)
- Solar server (déploiement low-tech, à séparer du dev)

---

## 7. Points ouverts / décisions à prendre

1. ~~**Pod Provider** : on auto-héberge sur quelle infra ?~~ **Tranché 2026-06-06** : hybride — dev sur armoise.co (comptes test), prod future sur `pod.kind.app` (Phase 3+). Voir section 5.3.
2. ~~**Seuil de review** : 2 approbations suffisent-elles ?~~ **Tranché 2026-06-06** : fixe à 2 pour toutes les lettres. À ré-évaluer si on observe des chambres d'écho (2 amis qui se valident en boucle) — solution probable à ce moment-là : exiger 2 approbations *de personnes hors des 5 derniers réviseurs*.
3. ~~**Que se passe-t-il si une lettre est rejetée ?**~~ **Tranché 2026-06-06** : message d'info à l'auteur, lettre repasse en `kind:Draft`. Resoumission **interdite** tant que le contenu n'a pas été modifié (vérification par hash du contenu au moment du rejet, stocké dans `kind:rejectedContentHash`).
4. ~~**Compteur des 17 actions** : qu'est-ce qui compte exactement ?~~ **Tranché 2026-06-06** : écrire et répondre = 1 chacun, approuver/draft/lire = 0. Une action = un passage en review (`submitDraft`).
5. ~~**Fenêtre horaire (idée board)**~~ **Tranché 2026-06-06** : on garde. Fermeture des actions d'écriture de **22h à 7h** dans le fuseau **de l'auteur** (`schema:timezone` du profil, fallback Europe/Paris). Lecture toujours autorisée. Réponse serveur `503 Service Closed`. `KindTimeWindowMiddleware` devient obligatoire (pas optionnel).
6. ~~**Modération des cercles**~~ **Tranché 2026-06-06** : autogestion. Le créateur (`kind:circleOwner`) gère seul (invite, exclut, supprime). Il peut **transmettre la propriété** à un membre via une action `kind-circles.transferOwnership`. Pas de modération centrale.
7. ~~**Mode hors-ligne / draft local**~~ **Tranché 2026-06-06** : autosave **côté serveur** (dans le Pod), pour pouvoir reprendre depuis un autre appareil. Pas d'IndexedDB en v1. Conséquence : pas d'édition offline en v1 — à reconsidérer si demande utilisateur forte.
8. ~~**i18n**~~ **Tranché 2026-06-06** : bilingue **FR + EN** par défaut. Sélecteur de langue UI. Les lettres elles-mêmes gardent leur `dc:language` propre (un user FR peut publier en anglais).

---

## 8. Risques techniques

| Risque | Impact | Mitigation |
|---|---|---|
| ActivityPods change l'API Apps Access Grants en v3 | Refonte du backend | Suivre les releases, contributer en amont |
| Le pattern peer-review n'a pas d'exemple dans la communauté | Plus de R&D que prévu | Spike en début de Phase 1, partager le pattern avec l'équipe SemApps |
| WAC groups ↔ AP audience : pas de pont auto | Logique custom à écrire pour résoudre les membres d'un cercle au moment du post | Helper côté `KindPeerReviewService._publish` |
| Fédération entre apps Kind sur Pods différents | Sources distantes pas dans le bon Pod | LDN (Linked Data Notifications) ou simple `as:Link` externe |
| Adoption / discoverability | Sans suggestion algorithmique, comment les users trouvent leurs cercles ? | Onboarding éditorial humain en phase 1 |
