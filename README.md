# A kind network

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Stack

- **Vite + React 18 + TypeScript**
- **React Router 6** for navigation
- **react-i18next** for FR / EN (language toggled from the profile page)
- Pure CSS (no Material-UI, no Tailwind) — see `src/styles/`
- Fonts served locally from `public/fonts/`: **Adelphe Floréal** (serif) + **Bricolage Grotesque** (sans)

## Pages

| Route | What it shows |
|---|---|
| `/` | Home — "Kind" wordmark at the center, 4 corner buttons |
| `/read` | First letter from mock inbox + sidebar + comments thread |
| `/read/:id` | Specific letter by id |
| `/write` | Empty composer (500 word cap, lined paper effect) |
| `/write/:draftId` | Composer pre-filled as a response |
| `/about` | Manifesto: 9 key elements + 3 pillars |
| `/me` | Profile: drafts, published, peers to review, language preference |

## Layout

The 4 navigation buttons are **fixed at the 4 corners** (desktop):
- Top-left: Lire
- Top-right: Écrire
- Bottom-left: À propos
- Bottom-right: Moi

The "Kind" wordmark only appears centered on the home page.

## What this prototype does NOT do (next phases — see [ARCHITECTURE.md](./docs/ARCHITECTURE.md))

- No real ActivityPods backend (mock data in `src/data/mock.ts`)
- No real auth / Solid login (Alice is hardcoded)
- No peer review workflow
- No 17/day rate limit enforcement (a gentle message will appear when reached, once implemented)
- No 22h-7h closure logic
- No real federation, no real WAC, no real sources fetch

## Editing

Hot module reload works — save any file and the browser refreshes.
TypeScript checking via `npm run build`.
