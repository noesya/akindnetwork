# Kind — backend

Moleculer node that hosts the Kind-specific logic on top of [ActivityPods](https://activitypods.org).

What it owns:

- `services/app.service.js` — declares Kind to any compatible Pod Provider via the `AppService` mixin from `@activitypods/app` (manifest, OIDC dynamic registration, consent screen, Apps Access Grants).
- `services/peer-review.service.js` — `submitDraft / approve / reject / _publish` workflow ([details](../docs/ARCHITECTURE.md#31-kindpeerreviewservice-le-service-le-plus-strategique)).
- `services/circles.service.js` — self-managed interest circles backed by WAC groups.
- `services/sources.service.js` — Open Graph / oEmbed enrichment (stub).
- `services/middlewares/rate-limit.js` — 17 submitDraft / day / WebID (Redis-backed).
- `services/middlewares/time-window.js` — closes writes from 22h to 7h in the author's timezone.
- `ontologies/kind.ttl` — the `kind:` vocabulary.
- `shapetrees/*.ttl` — shape trees declared in `accessNeeds`.

The frontend (root of the repo) connects to this backend via SemApps' data + auth providers. The backend never holds user data — everything lives in the user's Pod (armoise.co in dev, anywhere they want in prod).

## Prerequisites

- Node 20+
- Docker (for the local triplestore + Redis)
- An ngrok / cloudflared / tailscale-funnel tunnel — the Pod Provider must be able to fetch this server's manifest at boot time
- At least **two** test accounts on [app.armoise.co](https://app.armoise.co/) (author + reviewer)

## First-time setup

```bash
cp .env.example .env
# edit .env: set APP_BASE_URL to your tunnel URL

npm install
npm run stack:up        # starts Fuseki on :3030, Redis on :6379
```

## Run

```bash
npm run dev             # hot-reload via moleculer-runner
# or
npm start               # plain run
```

The server boots, registers `kind:` ontology + shape trees, exposes the app manifest at `${APP_BASE_URL}/.well-known/...`.

## How users discover the app

There is no manual registration on armoise.co. The first user logs into the Kind frontend, enters their armoise WebID, gets redirected to armoise.co OIDC, which fetches our manifest, shows the consent screen, and stores an Apps Access Grant. From then on, Kind can read/write `kind:Letter`, `kind:Source`, `kind:Circle` in their Pod, post to their outbox, and create WAC groups.

## Layout

```
backend/
├── package.json
├── .env.example
├── docker-compose.yml          # Fuseki + Redis
├── moleculer.config.js         # broker, transporter, middlewares
├── ontologies/
│   └── kind.ttl                # the kind: vocabulary
├── shapetrees/
│   ├── Letter.ttl
│   ├── Source.ttl
│   └── Circle.ttl
└── services/
    ├── app.service.js          # AppService mixin
    ├── peer-review.service.js  # the strategic piece
    ├── circles.service.js
    ├── sources.service.js
    ├── core/
    │   └── core.service.js     # ontology + shape tree bootstrap
    └── middlewares/
        ├── rate-limit.js       # 17/day on submitDraft only
        └── time-window.js      # 22h-7h author timezone
```

## What's still mocked

- LDP read/write paths in `peer-review.service.js` are stubs awaiting Phase 1 wiring.
- The `sources.service.js` enrichment is a no-op.
- No SHACL shapes inside the `*.ttl` shape trees yet.
- No tests.

See [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §6 for the full phase plan.
