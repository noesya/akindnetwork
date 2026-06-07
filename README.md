# A kind network

Monorepo : frontend Vite/React, backend Moleculer/ActivityPods, déploiement Docker via GitHub Actions sur VPS Infomaniak.

```
.
├── frontend/      Vite + React 18 + TS + SemApps providers
├── backend/       Moleculer + @activitypods/app
├── deploy/        docker-compose + Caddyfile + bootstrap VPS
├── docs/          ARCHITECTURE.md, Figma PDF, etc.
└── .github/       workflows ci.yml + deploy.yml + setup-vps.yml
```

## Run frontend (dev)

```bash
cd frontend
npm install
npm run dev
```

→ <http://localhost:5173>

## Run backend (dev)

```bash
cd backend
npm install
npm run stack:up    # Fuseki + Redis via docker-compose
npm run dev         # Moleculer hot-reload
```

Voir [`backend/README.md`](./backend/README.md) pour les détails (env vars, tunnel ngrok, etc.).

## Stack frontend

- **Vite + React 18 + TypeScript**
- **React Router 6**
- **react-i18next** (FR / EN, switchable depuis le profil)
- **ra-core + SemApps providers** (`@semapps/auth-provider`, `@semapps/semantic-data-provider`) — pas de react-admin UI
- CSS pur (Sass modulaire) — voir `frontend/src/styles/`
- Fonts servies en local : Adelphe Floréal (serif) + Bricolage Grotesque (sans)

## Pages

| Route | Affiche |
|---|---|
| `/` | Home — wordmark centré, 4 boutons aux coins |
| `/read`, `/read/:id` | Lecture d'une lettre (auth requise) |
| `/write`, `/write/:draftId` | Composer (auth requise) |
| `/about` | Manifeste : 9 éléments clés + 3 piliers |
| `/me` | Profil, brouillons, à relire, langue, login/logout Solid |
| `/login`, `/auth-callback` | Flow Solid-OIDC |

En mode **déconnecté**, seuls `À propos` et `Moi` sont visibles dans les coins. Lire et Écrire apparaissent une fois le Pod connecté.

## Deux modes

**Demo** (par défaut) — pas de backend, données mockées dans `frontend/src/data/mock.ts`, badge "Demo — données fictives" sur `/me`.

**Live** — quand `VITE_FRONTEND_URL` pointe sur une URL publique (le frontend déployé, ou un tunnel ngrok en dev), le login Solid s'active et les lettres viennent du Pod de l'utilisateur via SemApps.

## Déploiement

Cible : VPS Infomaniak Debian 13, stack Docker complète (Caddy + Moleculer + Fuseki + Redis). Tout est piloté par GitHub Actions :

| Workflow | Déclencheur | Effet |
|---|---|---|
| `ci.yml` | PR / push | typecheck + build frontend |
| `setup-vps.yml` | manuel | exécute `deploy/bootstrap.sh` sur le VPS (install Docker, ufw, hardening SSH) |
| `deploy.yml` | push main | build frontend → rsync dist + backend + compose → `docker compose up -d --build` |

Procédure complète dans [`deploy/README.md`](./deploy/README.md).

## Architecture

Voir [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) pour le détail des contraintes Kind (17/jour, peer review *a priori*, cercles, fermeture 22h-7h), du modèle de données (ontologie `kind:`, shape trees), des services Moleculer custom (PeerReview, Circles, RateLimit, TimeWindow) et du plan de phasing.
