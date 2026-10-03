# CARA frontend

React + TypeScript + Vite implementation of the supplied CARA dashboard reference.

## Run

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173). Build with `npm run build`.

The dashboard, garage, mileage, expenses, energy, service, history, reminders, external reports and AI assistant sections are wired to the **live vehicle-intelligence API** (auth, JWT in `localStorage`, per-vehicle data). The AI dialog calls the backend `/assistant/chat` endpoint and uses the configured AI gateway provider.

## API base URL

`src/api.ts` resolves the backend base URL in this order:

1. `VITE_API_URL` env var (set it for cross-origin static deploys, see `.env.example`);
2. the Render API URL when served from a non-localhost host;
3. same-origin (`""`) on localhost, where the Vite dev-server proxies `/auth`, `/garage`, `/vehicles`, `/health` to `http://localhost:3000` (override with `VITE_PROXY_TARGET`).

## Deploy

- **Single origin (recommended):** the NestJS backend serves `frontend/dist` itself (`src/main.ts`), so one Render deploy ships both. Build with `npm run build:web` at the repo root before deploying.
- **Two origins (Vercel static + Render API):** the root `vercel.json` builds `frontend/` and publishes `frontend/dist`. In the Vercel project set env `VITE_API_URL` to the Render URL; the backend already allows the Vercel origin via CORS (`CORS_ORIGINS`, default includes `https://vehicle-intelligence-nu.vercel.app`).

The hero, vehicle thumbnail and robot avatar images live in `public/` as optimized WebP (`hero.webp`, `car.webp`, `robot.webp`).

UI sounds are synthesized at runtime with the Web Audio API (`src/sound.ts`) — no audio files. Toggle them with the speaker button in the header; the preference persists in `localStorage` under `cara-sound`.
