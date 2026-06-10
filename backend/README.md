# Kind — backend

Nœud Moleculer qui héberge la logique métier de Kind par-dessus
[ActivityPods](https://activitypods.org). Le backend **ne stocke aucune
donnée utilisateur** — tout vit dans le Pod Solid de chaque membre. Ce
serveur n'est qu'un **orchestrateur** : il sait lire/écrire les Pods via
des AccessGrants SAI, il pilote le workflow de relecture par les pairs,
et il maintient un index volatil en mémoire pour fournir un flux de
lecture cross-pod.

---

## 1. Philosophie d'architecture

Kind est une *application* dans le monde Solid / ActivityPods, par
opposition à un *Pod Provider*. Concrètement :

- Les **Pod Providers** (armoise.co en dev, n'importe quel autre en
  prod) hébergent les profils, les lettres, les WebACL groups. Ils
  s'occupent de l'auth (OIDC), du stockage RDF, des notifications LDN.
- **Kind backend** *consomme* ces Pods via le protocole Solid
  Application Interoperability (SAI). Au premier login, le Pod
  Provider redirige l'utilisateur vers un écran de consentement
  affichant nos `AccessNeeds`. Si accepté, le Pod émet un
  `ApplicationRegistration` + des `AccessGrant` + des `DataGrant` qui
  donnent à notre serveur (et seulement lui) le droit d'agir sur les
  ressources concernées au nom de l'utilisateur.
- À partir de là, **les seules actions du backend** sont : (a) lire des
  ressources sur le Pod via le proxy HTTP-signature, (b) écrire en
  remplacement complet (PUT) ou par patch (PATCH) sur le Pod, (c)
  poster sur l'outbox du Pod, (d) gérer les WAC groups.

Pas de base utilisateur. Pas de table `users`. Pas de table `letters`.
Le backend est **stateless** au sens des données métier : il peut être
redémarré, redéployé, perdre son volume Fuseki — les utilisateurs et
leurs lettres survivent intégralement dans leurs Pods.

Ce que le backend stocke **dans Fuseki** (l'unique état non-Pod) :
- L'**actor de l'app** (`<APP_BASE_URL>/app`) et sa clé de signature ;
- Le cache des `AccessGrant` / `DataGrant` reçus de chaque Pod ;
- La table `auth-accounts` mappant WebID → JWT issuer (utilisée par les
  WebFinger lookups internes) ;
- Les ontologies (`kind:`, AS, FOAF, SchemaORG, Interop, OIDC, Notify…).

Ce que le backend stocke **dans Redis** :
- Le transporter Moleculer (communication inter-services si on scale) ;
- La file BullMQ pour les ActivityPub deliveries asynchrones ;
- Le `CacherMiddleware` (cache d'actions, surtout les ACL checks) ;
- Les compteurs **17/jour/WebID** du middleware `rate-limit`.

Ce qui est **purement en mémoire** dans le process :
- L'**index `kind-letters`** : `Map<letterUri, LetterEntry>` qui agrège
  toutes les lettres connues du réseau pour servir le flux cross-pod.
  Reconstruit à chaque boot par scan des DataGrants.

---

## 2. Stack technique

| Couche | Choix | Pourquoi |
|---|---|---|
| Runtime | **Node ≥ 22.12** | Pré-requis `@activitypods/app@2.x` |
| Framework microservices | **Moleculer 0.14** | Imposé par SemApps |
| HTTP gateway | **moleculer-web 0.10** | Vient avec `@semapps/core` |
| Triplestore | **Apache Jena Fuseki** | Stocke l'état SemApps (acteur app, AccessGrants, settings) |
| Cache / transporter / file | **Redis 7 + BullMQ** | Cacher, Moleculer transporter, AP deliveries |
| App ActivityPods | **@activitypods/app 2.2** | Mixin officiel `AppService` + suite de services SAI |
| Core Solid | **@semapps/core 1.1** | Bundle (LDP, ActivityPub, WebACL, ontologies, JSON-LD…) |
| Signatures HTTP | **@semapps/crypto** | Proxy signé pour requêtes vers les Pods distants |
| Reverse proxy en prod | **Caddy** | TLS auto + CORS Origin-reflect, voir `../docker/Caddyfile` |

---

## 3. Anatomie des services

Le projet enregistre 6 services métier + reprend ~30 services hérités
des mixins SemApps/ActivityPods. Le contrat avec Moleculer : chaque
fichier `services/**/*.service.js` exporte un objet `{ name, settings,
actions, events, methods }`. La découverte est automatique
(`moleculer-runner services/**/*.service.js`).

### 3.1. Services Kind (logique métier)

| Fichier | Nom Moleculer | Rôle |
|---|---|---|
| `services/app.service.js` | `app` (via mixin `AppService`) | Manifeste de l'app pour SAI, déclare les `AccessNeeds`, gère le consent screen |
| `services/peer-review.service.js` | `kind-peer-review` | Workflow `submitDraft` / `approve` / `reject` + seuil de validation |
| `services/kind-letters.service.js` | `kind-letters` | Index volatil cross-pod + endpoints `/letters/*` |
| `services/kind-auth.service.js` | `auth` | Décode le JWT Bearer en `ctx.meta.webId` (stand-in pour les apps qui n'émettent pas de tokens) |
| `services/circles.service.js` | `kind-circles` | Création / membres / transfert de propriété des cercles (mappés sur WAC groups) |
| `services/sources.service.js` | `kind-sources` | Enrichissement Open Graph / oEmbed (stub, à câbler phase 2) |

### 3.2. Services techniques (SemApps + Kind)

| Fichier | Mixin | Rôle |
|---|---|---|
| `services/core/core.service.js` | `@semapps/core` `CoreService` | Bootstrap LDP / triplestore / activitypub / WAC / ontologies / JSON-LD |
| `services/core/auth-account.service.js` | `@semapps/auth` `AuthAccountService` | Mini-table WebID → issuer pour WebFinger |
| `services/core/proxy.service.js` | `@semapps/crypto` `ProxyService` | Signature HTTP pour les requêtes outbound vers les Pods |
| `services/core/notification-listener.service.js` | `@semapps/solid` `NotificationsListenerService` | Réception des LDN sur l'inbox de l'actor app |
| `services/core/nodeinfo.service.js` | `@semapps/nodeinfo` `NodeinfoService` | `/.well-known/nodeinfo` (Fediverse discovery) |

### 3.3. Services importés par `@activitypods/app` (le mixin `AppService`)

`AppService` est lui-même une composition d'une vingtaine de
sous-services qui démarrent automatiquement. Les plus importants pour
nous :

| Service | Rôle |
|---|---|
| `app-registrations` | Cache des `ApplicationRegistration` reçus des Pods (= liste des users) |
| `access-grants` | Cache des `AccessGrant` pour chaque user |
| `data-grants` | Cache des `DataGrant` par container × shape tree |
| `pod-resources` | GET/PUT/PATCH sur un Pod distant via proxy signé |
| `pod-outbox` | POST sur l'outbox d'un utilisateur (pour Invite, Like, etc.) |
| `pod-collections` | Manipulation de `as:Collection` sur les Pods |
| `pod-wac-groups` | CRUD sur les groupes WAC (utilisés par les cercles) |
| `app.registration` | Endpoint OIDC de Dynamic Client Registration |
| `actors` | Gère l'actor de l'app (`<base>/app`) |
| `shape-trees` | Sert `/shapetrees/Letter.ttl` etc. quand un Pod les demande |

---

## 4. Routes HTTP exposées

La gateway moleculer-web est instanciée par `CoreService`. Chaque
service Kind ajoute ses propres routes via `api.addRoute`. Toutes les
routes critiques utilisent `toBottom: false` pour passer **devant** le
catch-all LDP `/:slugParts*` qui sinon avalerait tout.

### 4.1. Routes Kind-specific

#### `kind-letters` — flux de lecture cross-pod

Authentification : Bearer JWT optionnel (anonyme = lectures publiées
seulement). Les routes sont déclarées avec une **contrainte regex
UUID** sur le param `:id` pour éviter que `GET /:id` n'avale `/feed`
ou `/_rehydrate`.

| Méthode | Chemin | Action | Comportement |
|---|---|---|---|
| GET | `/letters/feed` | `kind-letters.feed` | Flux du viewer : pending-review qu'il peut voter en tête, puis publiées (avec filtre topologique). Tri pending d'abord, puis `publishedAt` desc. |
| GET | `/letters/by-author/:username` | `kind-letters.byAuthor` | Toutes les lettres publiées d'un auteur (dernier segment WebID = `username`). Pas de filtre topologique : la page profil veut l'historique complet. |
| GET | `/letters/:id` | `kind-letters.byId` | Une lettre par UUID. `:id` = `[a-fA-F0-9-]{36}`. |
| GET | `/letters/:id/children` | `kind-letters.children` | Enfants publiés d'une lettre (réponses), triés `publishedAt` asc. |
| POST | `/letters/_rehydrate` | `kind-letters.rehydrate` | Rebuild manuel de l'index. Auto-déclenché au boot. |

#### `kind-peer-review` — workflow de modération

Authentification : Bearer JWT obligatoire (`ctx.meta.webId` doit être
peuplé, sinon `401`).

| Méthode | Chemin | Action | Décrément 17/jour | Effet |
|---|---|---|---|---|
| POST | `/peer-review/submit-draft` | `submitDraft` | **+1** | Flippe le statut `draft` → `pending-review`, zéro les compteurs de votes, purge `assignedReviewers` (legacy). |
| POST | `/peer-review/approve` | `approve` | 0 | Ajoute le caller à `kind:approvedBy`. Si seuil atteint → `published` + `as:published`. |
| POST | `/peer-review/reject` | `reject` | 0 | Ajoute `{reviewer, comment}` à `kind:rejectedBy`. Si seuil atteint → retour `draft` + `kind:rejectedContentHash` + `kind:rejectionReasons`. |

Body JSON :
- `submit-draft` : `{ letterUri: string }`
- `approve` : `{ letterUri: string }`
- `reject` : `{ letterUri: string, comment: string }` (1 ≤ len ≤ 500)

Réponses :
- `submit-draft` → `{ status: "pending-review" }`
- `approve` / `reject` → `{ status, approvedCount, rejectedCount, threshold }` — `status` reflète l'état FINAL après application du vote.

Codes d'erreur métier (`MoleculerClientError`) :

| HTTP | type | Cas |
|---|---|---|
| 401 | `UNAUTHORIZED` | Pas de Bearer / webId='anon' |
| 403 | `SELF_REVIEW` | Tentative de voter sur sa propre lettre |
| 409 | `NOT_A_DRAFT` | submitDraft sur une lettre non-draft |
| 409 | `NOT_IN_REVIEW` | Vote sur une lettre déjà publiée ou close |
| 409 | `ALREADY_VOTED` | Le caller a déjà voté |
| 409 | `UNCHANGED_AFTER_REJECTION` | Hash identique à la rejection précédente |
| 400 | `BAD_LETTER_URI` | URI dont le pattern ne donne pas un WebID |
| 429 | `KIND_DAILY_LIMIT_REACHED` | 17/jour dépassés (middleware) |
| 503 | `KIND_QUIET_HOURS` | Action tentée entre 22h et 7h (middleware) |

### 4.2. Routes héritées (SemApps / ActivityPods)

Toutes exposées sous le même domaine. Référence rapide :

| Préfixe | Source | Rôle |
|---|---|---|
| `/.well-known/oauth-authorization-server` | `app.registration` | OIDC discovery |
| `/.well-known/nodeinfo` | `nodeinfo` | Fediverse discovery |
| `/auth/jwks` | `app.registration` | Clés publiques pour la signature des tokens app |
| `/app` | `actors` | L'actor ActivityPub de l'application elle-même |
| `/access-needs-groups/<uuid>` | `access-needs-groups` | Les `AccessNeed` consommés au consent screen |
| `/shapetrees/<name>` | `shape-trees` | Sert les `*.ttl` du répertoire `shapetrees/` |
| `/proxy/...` | `proxy` (SemApps crypto) | Proxy signé pour les fetches vers d'autres Pods |
| `/:container/:slugParts*` | `ldp` (catch-all) | Lecture LDP générique sur les ressources hébergées par notre actor (rare) |

---

## 5. Modèle de données

### 5.1. Ontologie `kind:`

Définie dans `ontologies/kind.ttl`, préfixe `https://kind.app/ns#`.
On ne mint que ce qui n'existe pas en standard.

**Classes** :
- `kind:Letter` ⊆ `as:Article`
- `kind:Source`
- `kind:Circle`
- `kind:Approval`

**Status individuals** (`kind:Draft`, `kind:InReview`, `kind:Published`) déclarés mais en pratique le statut est stocké comme chaîne (`"draft"`, `"pending-review"`, `"published"`) dans `kind:status` — TODO unifier.

**Propriétés** :

| Prédicat | Domaine | Range | Usage |
|---|---|---|---|
| `kind:status` | Letter | String | `"draft"` / `"pending-review"` / `"published"` |
| `kind:approvedBy` | Letter | WebID[] | Reviewers qui ont approuvé |
| `kind:rejectedBy` | Letter | `{reviewer, comment}[]` | Reviewers qui ont rejeté + leurs commentaires |
| `kind:rejectedContentHash` | Letter | xsd:string | SHA-256 du contenu rejeté, anti-resubmit verbatim |
| `kind:rejectionReasons` | Letter | `{reviewer, comment}[]` | Snapshots des rejets propagés vers le draft suivant |
| `kind:assignedReviewers` | Letter | WebID[] | **DEPRECATED** — vestige de l'assignation pré-allouée, lu mais jamais utilisé. Toujours écrit à `[]` sur les nouveaux flips. |
| `as:inReplyTo` | Letter | Letter URI | Une réponse, à un autre Letter ou Note |
| `kind:sources` | Letter | URL[] | URLs des sources citées (typage léger pour MVP) |
| `kind:language` | Letter | `"fr"` / `"en"` | Affichage de la lettre (peu structurant) |
| `kind:circle` | Letter | Circle URI | (cercles, encore stub côté UI) |
| `kind:circleOwner` | Circle | WebID | Propriétaire unique (transferable) |

### 5.2. Shape trees

Trois shape trees dans `shapetrees/` :

- `Letter.ttl` — `st:Resource`, ce que le Pod range dans `data/as/note/`
- `Source.ttl` — `st:Resource`
- `Circle.ttl` — `st:Container`

Les `AccessNeeds` déclarés dans `app.service.js` ciblent en pratique
**le shape tree public d'ActivityPods** `as/Note`
(`https://shapes.activitypods.org/shapetrees/as/Note`) plutôt que notre
propre `kind:Letter`, parce que les Pod Providers fetch les shape trees
pendant le consent — utiliser une URL publique évite la roundtrip vers
notre serveur pendant la première install.

### 5.3. Cycle de vie d'une `Letter`

```
draft ──submitDraft──▶  pending-review
                            │
              2 approve  ◀──┤
                    │       │
                    ▼       └──▶ 2 reject  ──▶  draft
                published                       (+ contentHash
                                                 + rejectionReasons)
```

- `submitDraft` : exige `draft`, refuse `pending-review` ou `published`, refuse hash identique à un rejet antérieur.
- `approve` / `reject` : exigent `pending-review`, refusent l'auteur (`SELF_REVIEW`), refusent le double vote (`ALREADY_VOTED`).
- Seuil par défaut : `KIND_REVIEW_THRESHOLD=2`. Premier à 2 (approve ou reject) gagne. Sans pool fixe — n'importe quel pair non-auteur peut voter.

### 5.4. Index `kind-letters` (en mémoire)

Forme d'une entrée :

```ts
type LetterEntry = {
  uri:                string;          // ID Solid complet
  uuid:               string;          // dernier segment du chemin
  authorWebId:        string;
  parentUri:          string | null;   // <as:inReplyTo>
  status:             'draft' | 'pending-review' | 'published' | 'rejected';
  publishedAt:        string | null;   // ISO 8601
  title:              string;
  content:            string;          // body brut, plain text
  language:           string;
  sources:            string[];
  approvedBy:         string[];
  rejectedBy:         { reviewer: string; comment: string }[];
  assignedReviewers:  string[];        // legacy, présent pour compat
}
```

Les **drafts ne sont pas indexés** — seul l'auteur a besoin de les
voir, et il les lit directement sur son Pod via le dataProvider du
frontend.

---

## 6. Flux complets

### 6.1. Login + consentement (premier passage d'un user)

```
Frontend             Pod Provider (armoise.co)            Kind backend
   │                       │                                    │
   │── click "Connecter" ──▶                                    │
   │                       │── fetch APP_BASE_URL/manifest ────▶│
   │                       │◀──────── manifest + AccessNeeds ───│
   │◀── consent screen ────│                                    │
   │── click "Autoriser" ──▶                                    │
   │                       │── crée ApplicationRegistration ────│ (stocké côté Pod)
   │                       │── émet AccessGrant + DataGrants ──▶│ (cachés dans Fuseki)
   │                       │                                    │
   │◀── redirect avec code ┤                                    │
   │── échange code/token ─▶                                    │
   │◀── JWT Bearer ────────────────                              │
```

Le JWT contient un claim `webid` (ou `webId` legacy). Toutes les
requêtes ultérieures vers le backend portent ce token et le
service `auth` le décode en `ctx.meta.webId`.

### 6.2. Écriture d'une lettre

1. L'utilisateur écrit dans `LetterEditor` → `dataProvider.create('Letter', data)` → POST sur `https://<userpod>/<user>/data/as/note/`.
2. La requête transite par le **proxy SemApps** : signée avec la clé de l'app, autorisée côté Pod par le `DataGrant` posé sur ce container.
3. La lettre est créée avec `kind:status: "draft"`. Elle n'apparaît dans **aucun flux** — ni public, ni de l'index `kind-letters` (les drafts sont filtrés à l'indexation).
4. Quand l'auteur clique **« Envoyer en relecture »** :
   - Le frontend appelle `POST /peer-review/submit-draft { letterUri }`.
   - Le middleware `rate-limit` vérifie `kind:rate:<webId>:<YYYY-MM-DD>` dans Redis. Incrément atomique. Au-delà de 17 → `429`.
   - Le middleware `time-window` lit le timezone du Pod (fallback `Europe/Paris`). Entre 22h et 7h → `503`.
   - L'action vérifie : caller authentifié, lettre en `draft`, contenu ≠ rejection précédente.
   - PUT sur la lettre pour passer `kind:status: "pending-review"`.
   - Émet `kind.letter.submitted { letterUri, authorWebId }`.
5. `kind-letters` écoute l'événement → `_refreshEntry` → fetch la lettre via `pod-resources.get` → `_upsertFromLetter` → entrée ajoutée à l'index avec status `pending-review`.
6. Au prochain `GET /letters/feed` de **n'importe quel pair non-auteur**, la lettre apparaît en tête du flux.

### 6.3. Vote d'un relecteur

1. Reviewer clique « Approuver » dans `LetterView` (les boutons apparaissent si `letter.status === 'in-review' && letter.authorWebId !== me && !déjàVoté`).
2. Frontend → `POST /peer-review/approve { letterUri }`.
3. `_castVote` :
   - Extrait `authorWebId` du letterUri (regex `^https?://<host>/<user>/data/`).
   - Fetch la lettre **via `pod-resources.get` en utilisant `actorUri = authorWebId`** — le proxy signe la requête comme étant l'app agissant pour l'auteur, ce qui passe la WAC du Pod auteur.
   - Vérifie status `pending-review`, refuse SELF_REVIEW, refuse double vote.
   - Calcule `nextApproved` / `nextRejected`.
   - Si `nextApproved.length >= threshold` (2) → `kind:status: "published"` + `as:published`.
   - Si `nextRejected.length >= threshold` → `kind:status: "draft"` + contentHash + rejectionReasons + wipe vote arrays.
   - PUT la version mergée sur le Pod auteur.
   - Émet `kind.letter.approved` ou `kind.letter.rejected`.
4. `kind-letters` re-fetch la lettre et met l'index à jour. Si elle est désormais `published`, le filtre topologique du `feed` la fait apparaître dans le flux public.

### 6.4. Lecture cross-pod (le flux `/read`)

```
Frontend                        Kind backend                         Pods
   │                                  │                                │
   │── GET /letters/feed ────────────▶│                                │
   │                                  │ filter visibleToMe(me)         │
   │                                  │ + topological filter           │
   │                                  │ + sort                         │
   │◀── 200 [LetterEntry, …] ────────│                                │
   │                                  │ (toutes les bodies déjà là)   │
   │── render <LetterView/>           │                                │
```

L'index a été pré-peuplé soit par les events `submitted/approved/rejected`, soit par le rehydrate au boot (cf §6.5).

### 6.5. Réveil du backend (rehydrate au boot)

1. `kind-letters.started()` appelle `api.addRoute` puis lance un fire-and-forget :
   ```js
   broker.waitForServices(['app', 'data-grants', 'pod-resources'])
     .then(() => broker.call('kind-letters.rehydrate'))
   ```
   Le `'app'` est crucial — `pod-resources.get` appelle `app.get` en interne pour récupérer l'actor app, et ce service finit de s'enregistrer ~2s après ses dépendances. Sans cette attente, tous les fetches du premier scan échouent avec `Service 'app.get' is not found`.

2. `rehydrate` :
   - `data-grants.list` → liste de tous les `DataGrant` cachés (un par container × shape tree × user).
   - Pour chaque DG ciblant le shape tree `as/Note`, fetch le container via `pod-resources.get` en signant comme l'owner.
   - Pour chaque LDP item du container, fetch la lettre + `_upsertFromLetter` dans l'index.
   - Les drafts sont filtrés (delete plutôt qu'upsert).

3. Logs typiques :
   ```
   kind-letters HTTP routes registered at /letters/*
   Service 'kind-letters' started.
   'app' service is registered.
   kind-letters.rehydrate: 12 data grants in cache
   kind-letters.rehydrate: container has 3 item(s)
   kind-letters: indexed https://.../letter-xxx (status=pending-review)
   kind-letters.rehydrate: done — scanned 12 DG, indexed N item(s), N live entries
   ```

---

## 7. Middlewares

Ordre déclaré dans `moleculer.config.js` (l'ordre **compte**) :

1. **`CacherMiddleware`** (SemApps) — cache d'actions en Redis, surtout pour les ACL checks. Doit précéder WAC.
2. **`WebAclMiddleware`** (SemApps) — applique la WAC sur chaque action LDP. Surtout, **séquence les events `ldp.resource.created` derrière le commit SPARQL** — sans ça, nos listeners se déclencheraient avant que la ressource soit interrogeable (race condition).
3. **`rate-limit`** (Kind) — incrémente `kind:rate:<webId>:<YYYY-MM-DD>` (TTL 25h) à chaque `kind-peer-review.submitDraft`. Limite par défaut 17/jour, configurable `KIND_DAILY_ACTION_LIMIT`. Approuver / rejeter sont gratuits.
4. **`time-window`** (Kind) — bloque les actions `submitDraft / approve / reject / ldp.resource.{patch,post}` entre 22h et 7h dans le timezone de l'auteur (lu depuis le `schema:timezone` du profil, fallback `Europe/Paris`). Désactivable par `KIND_QUIET_HOURS_START=off`.

---

## 8. Variables d'environnement

Toutes lues dans `services/**/*.service.js` et `moleculer.config.js`. Fichier modèle : `.env.example`.

### 8.1. Réseau et URLs publiques

| Var | Effet | Exemple |
|---|---|---|
| `APP_BASE_URL` | URL publique du backend. **Doit être joignable par les Pod Providers** au boot (manifest fetch). | `https://api.akindnetwork.org` |
| `APP_FRONT_URL` | URL du frontend, sert pour redirects OIDC et logo dans le manifeste. | `https://akindnetwork.org` |
| `PORT` | Port d'écoute Moleculer. | `3000` |

### 8.2. Infrastructure

| Var | Effet |
|---|---|
| `SPARQL_ENDPOINT` | URL HTTP Fuseki (`http://fuseki:3030` en docker) |
| `SPARQL_USER` / `SPARQL_PASSWORD` | Auth Fuseki |
| `MAIN_DATASET` | Nom du dataset (default `kind`) |
| `AUTH_ACCOUNTS_DATASET_NAME` | Dataset séparé pour `auth-accounts` (default `settings`) |
| `REDIS_URL` | Redis du transporter + BullMQ |
| `REDIS_CACHE_URL` | Redis du cacher d'actions (souvent même que REDIS_URL avec autre DB) |
| `QUEUE_SERVICE_URL` | Override pour la BullMQ AP, fallback `REDIS_URL` |
| `NODE_ID` | Override de l'ID du nœud Moleculer (defaut `kind-app-<pid>`) |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` |
| `NODE_ENV` | `production` désactive le hot-reload |

### 8.3. Règles Kind

| Var | Default | Effet |
|---|---|---|
| `KIND_DAILY_ACTION_LIMIT` | `17` | Quota `submitDraft` par WebID par jour |
| `KIND_REVIEW_THRESHOLD` | `2` | Nombre d'approves (ou rejects) qui ferme la review |
| `KIND_QUIET_HOURS_START` | `22` | Heure de fermeture (timezone auteur) — `off` pour désactiver |
| `KIND_QUIET_HOURS_END` | `7` | Heure de ré-ouverture |

---

## 9. Mise en route (développement)

### 9.1. Pré-requis

- Node ≥ 22.12 ;
- Docker (pour Fuseki + Redis locaux) ;
- Un tunnel public **joignable** depuis les Pod Providers (ngrok, cloudflared, tailscale-funnel, etc.) — au moment où le Pod va fetch le manifeste de notre app, il faut qu'il y arrive ;
- Au moins **deux comptes test** sur le même Pod Provider (auteur + reviewer). [app.armoise.co](https://app.armoise.co/) en supporte plusieurs.

### 9.2. Setup

```bash
cp .env.example .env
# éditer .env : APP_BASE_URL = ton URL de tunnel

npm install
npm run stack:up        # docker-compose: Fuseki :3030, Redis :6379
npm run dev             # moleculer-runner --hot --env --repl
```

Au boot tu dois voir :
```
INFO  REGISTRY: 'app' service is registered.
INFO  KIND-LETTERS: kind-letters HTTP routes registered at /letters/*
INFO  KIND-PEER-REVIEW: kind-peer-review HTTP route registered at /peer-review/*
INFO  KIND-LETTERS: kind-letters.rehydrate: done — scanned N DG, indexed M item(s)
```

### 9.3. Test rapide

1. Login sur le frontend avec un compte Pod (l'écran de consentement s'affiche).
2. Vérifier que `data-grants.list` retourne quelque chose :
   ```bash
   curl -s localhost:3000/data-grants | jq
   ```
3. Écrire une lettre, l'envoyer en relecture.
4. Login avec un autre compte → la lettre doit apparaître en tête de `/read`.

---

## 10. Déploiement (production)

Voir aussi `../docs/deploy.md`. En résumé :

- `Dockerfile` à la racine du repo (`../docker/backend.Dockerfile`) — image Node basée sur `node:22-alpine`, copie `backend/` et lance `npm start`.
- `docker-compose.yml` à la racine du repo orchestre : `moleculer` + `fuseki` + `redis` + `caddy` (TLS + proxy).
- Caddy fait :
  - HTTPS auto sur `api.akindnetwork.org` ;
  - **CORS Origin-reflect** pour le frontend (`Access-Control-Allow-Origin` = origin requesteur, sinon `*` quand pas d'Origin pour les fetches server-side) ;
  - Proxy vers `moleculer:3000`.
- Volumes :
  - `fuseki-data` (état SemApps : actor app, AccessGrants, settings) ;
  - `redis-data` (queue + counters).

Au premier déploiement, le bootstrap (`../docker/bootstrap.sh`) crée le dataset Fuseki et l'utilisateur admin.

### 10.1. Redéploiement

```bash
ssh kind 'cd /opt/kind && git pull && docker compose up -d --build moleculer'
ssh kind 'cd /opt/kind && docker compose logs -f moleculer'
```

L'index `kind-letters` se reconstruit automatiquement au boot via le `rehydrate`. Aucune action manuelle requise.

### 10.2. Wipe complet (récupérer un état propre)

```bash
ssh kind 'cd /opt/kind && docker compose down -v'
ssh kind 'cd /opt/kind && docker compose up -d --build'
```

Les utilisateurs devront re-consentir au prochain login (les AccessGrants côté Pod survivent en revanche). Leurs lettres existantes restent dans leur Pod et seront ré-indexées au boot.

---

## 11. Diagnostic

### 11.1. Logs utiles

```bash
# Voir le boot complet :
docker compose logs moleculer | head -200

# Index kind-letters :
docker compose logs moleculer | grep "kind-letters"

# Rate limit :
docker compose logs moleculer | grep "KIND_DAILY_LIMIT"

# Quiet hours :
docker compose logs moleculer | grep "KIND_QUIET_HOURS"

# Erreurs Pod-side (502/503 quand un Pod ne répond pas) :
docker compose logs moleculer | grep -iE "pod-resources.*not ok|Service.*not found"
```

### 11.2. Inspecter l'index en runtime

`moleculer-runner --repl` (en dev) ou via REPL Docker (`docker compose exec moleculer node -e '...'`) :

```js
// Liste les entrées :
broker.call('kind-letters.feed', {}, { meta: { webId: 'system' }})
  .then(r => console.log(r.letters.length, 'live entries'));

// Force un rehydrate :
broker.call('kind-letters.rehydrate').then(r => console.log(r));
```

### 11.3. Erreurs courantes au boot

| Symptôme | Cause probable | Fix |
|---|---|---|
| `kind-letters.rehydrate: container fetch threw — Service 'app.get' is not found` | Le rehydrate part avant que `app` ne soit registered | Vérifier que `'app'` est dans `waitForServices` |
| Container fetch return `500` sur certains Pods | Le user a un DataGrant mais pas encore de container `as/note/` (jamais écrit) | Sans impact — au premier write côté user, le container apparaîtra et la prochaine indexation fonctionnera |
| `Service 'auth.authenticate' not found` au moment d'un POST `/peer-review/...` | `kind-auth.service.js` n'a pas été chargé | Vérifier que le fichier est bien `services/kind-auth.service.js` (pattern `**/*.service.js` du moleculer-runner) |
| `kind-letters.feed` retourne 404 `"No letter with id feed"` | Collision route : `/:id` mange `/feed` | Vérifier la contrainte regex `:id([a-fA-F0-9-]{36})` |
| Manifeste pas joignable depuis le Pod Provider | `APP_BASE_URL` n'est pas exposé publiquement | Vérifier ngrok / tunnel, recharger l'app sur le Pod Provider |

---

## 12. Ce qui n'est pas (encore) là

- **Signature JWT non vérifiée** dans `kind-auth.service.js` — on accepte tout token syntaxiquement valide avec un claim `webid`. Avant d'ouvrir au public : vérifier la signature contre le JWKS du issuer via OIDC discovery.
- **Sources non enrichies** — `kind-sources.enrich` est un stub, retourne des nulls. Phase 2 : fetch Open Graph + cache + rate limit outbound.
- **Pas de SHACL** dans les shape trees — ils déclarent juste `st:shape <#XxxShape>` mais le shape n'existe pas (toléré par les Pod Providers actuels, à corriger).
- **Pas de tests** — le projet est en exploration, ratio écrite/cassée trop élevé pour figer encore.
- **Cercles côté UI absents** — le service `kind-circles` est fonctionnel, le frontend ne l'utilise pas encore.
- **Index `kind-letters` non persisté** — perdu à chaque redémarrage, reconstruit par rehydrate. Acceptable tant que le scan reste rapide (<10s pour ~10 Pods). À persister dans Fuseki ou Redis quand le réseau dépassera quelques centaines de pairs.
- **Ratio lecture/relecture non implémenté** — pour l'instant *toutes* les pending visibles passent en tête. Si le backlog devient trop gros, prévoir un sampling.
