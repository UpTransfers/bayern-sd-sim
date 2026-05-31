# FC Bayern Sporting Director Simulator

Fan-made Bayern sporting-director simulator for the 2026-27 planning cycle.

## Disclaimer

This is a fan-made simulator with no official affiliation with FC Bayern München AG.

Simulator values, transfer fees, wage tiers, and projections are model estimates unless a source is explicitly labeled as live/free-source data or curated fallback data.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide React
- Zustand
- Zod
- Supabase-ready Postgres schema for later persistent deployment

## What the app does

- manage Bayern squad planning
- sell and loan players with previewed consequences
- search and negotiate transfers from the market pool
- set formation, tactics, and set-piece roles
- simulate the Bundesliga, DFB-Pokal, and Champions League
- generate a season report and share card

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Environment

Use the variables from [.env.example](./.env.example).

- `NEXT_PUBLIC_` variables are exposed to the browser.
- API keys are optional for the MVP.
- Missing API keys trigger fallback mode instead of crashing the app.
- Do not commit real secrets.

## Run

### Development

```bash
npm run dev
```

### Production build

```bash
npm run build
```

### Production preview locally

```bash
npm run start
```

## Deploy

### Vercel

1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. Add the environment variables.
4. Deploy.

### Netlify

1. Push the repo to GitHub.
2. Import the repo into Netlify.
3. Add the environment variables.
4. Deploy.

Netlify and Vercel can run the app, but the current MVP uses local/runtime store persistence. That is fine for demos and short-lived testing, but a production app should move to durable storage such as Supabase/Postgres later.

## Data honesty

- Live/free-source data is labeled when it comes from a healthy free source.
- Curated fallback data is manually researched continuity data, not live market data.
- Simulator estimate means the app generated the value.
- External reference value means the number is based on research/reference data, not an official club source.
- Estimated wage tier means a wage band estimate, not an official payroll figure.
- Simulator model means internal logic output.
- Simulator result means the season output from the app.

## Source limitations

- Some free sources do not expose every field.
- Optional sources may be unavailable without API keys.
- Fallback/manual data is used only when live data is missing or incomplete.
- Raw source payloads are kept for auditability where the app supports it.

## Known limitations

- Runtime/local JSON storage is MVP/demo persistence, not a durable production database.
- Some squad and market values are estimates.
- The first release keeps the flow intentionally simple: no deadline-day chaos, hidden endings, or dynasty mode.

