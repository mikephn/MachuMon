# MachuMon

MachuMon monitors live Machu Picchu ticket availability from the Tu Boleto site, records snapshots over time, and renders the results in a Next.js dashboard.

The repository is split into two concerns:

- the app branch serves the dashboard UI on Vercel
- the `collector-data` branch stores collected raw snapshots and the exported dashboard payload

## How It Works

### Collector

The collector is implemented in [scripts/collector.ts](scripts/collector.ts).

It launches Playwright, opens the Tu Boleto page, and listens to the page's network responses instead of scraping a single DOM snapshot. This matters because the source site rotates visible dates roughly every 30 seconds.

During a collection session, the script:

1. opens the target page
2. listens for ticket availability API responses
3. normalizes route data into a stable internal shape
4. writes new snapshots to `data/raw/YYYY-MM-DD.jsonl`
5. updates `data/state/collector-status.json`
6. regenerates `public/data/dashboard.json`

The one-shot collector window is configurable with `MONITOR_ONCE_DURATION_MS` and currently defaults to 150 seconds for scheduled runs.

### Dashboard Data Pipeline

The data helpers live in [src/lib/monitor-data.ts](src/lib/monitor-data.ts).

The dashboard can load data from three sources:

1. remote exported JSON via `MONITOR_REMOTE_DATA_URL`
2. local raw snapshot files if remote data is unavailable
3. an empty dashboard state when no data exists yet

The exported dashboard payload is written to:

- `public/data/dashboard.json`

The collector status is written to:

- `data/state/collector-status.json`

The raw history is written to:

- `data/raw/*.jsonl`

### Frontend

The dashboard is a Next.js app under `src/app` and `src/components`.

Current UI behavior:

- the Availability trace dropdown groups dates newest first
- the Route lifecycle table shows newest dates first
- the Latest date boards show the 3 newest dates
- the Latest readout follows the currently selected route/day pair
- displayed absolute times are shown in Peru time (`America/Lima`, PET, UTC-5)

The page revalidates every 5 minutes so Vercel does not refetch on every request.

## Repository Structure

```text
.
├── .github/workflows/collector-v2.yml
├── data/
│   ├── raw/
│   └── state/
├── public/
│   └── data/
├── scripts/
│   ├── collector.ts
│   └── export-dashboard.ts
└── src/
    ├── app/
    ├── components/
    └── lib/
```

## Local Development

Install dependencies:

```bash
npm ci
```

Run the dashboard locally:

```bash
npm run dev
```

Run the collector continuously:

```bash
npm run collector
```

Run a single collection session:

```bash
npm run collector:once
```

Export dashboard data from the current local snapshots:

```bash
npm run export:data
```

Create a production build:

```bash
npm run build
```

## Environment Variables

These variables are supported by the project.

### Collector

- `MONITOR_URL`
  Overrides the default Tu Boleto target URL.

- `MONITOR_ONCE_DURATION_MS`
  Length of a one-shot collector session in milliseconds.

### Dashboard

- `MONITOR_REMOTE_DATA_URL`
  URL that serves the exported `dashboard.json` payload. In production this should point at the `collector-data` branch.

- `MONITOR_REMOTE_DATA_TOKEN`
  Optional bearer token for remote dashboard fetches. This is not needed for a public GitHub repository.

Do not commit tokens, API keys, or scheduler credentials into this repository.

## Deployment Model

### GitHub Repository Layout

Use two branches:

- `main` for the application code
- `collector-data` for collected data files

The app branch intentionally ignores runtime data in `.gitignore`. The workflow copies the latest data into `collector-data` and commits there.

### GitHub Actions Workflow

The workflow is defined in [.github/workflows/collector-v2.yml](.github/workflows/collector-v2.yml).

It does the following:

1. checks out the app branch
2. checks out or initializes `collector-data`
3. restores prior `data/` from `collector-data`
4. installs dependencies and Playwright Chromium
5. runs `npm run collector:once`
6. runs `npm run export:data`
7. copies updated files into `collector-data`
8. commits and pushes the updated data branch

The workflow currently uses `workflow_dispatch` only.

That means GitHub's built-in `schedule` trigger is disabled and an external scheduler should trigger the workflow through the GitHub API.

## External Scheduling

This repository is designed to work with an external cron service that calls the GitHub `workflow_dispatch` API.

Example dispatch target:

```text
POST https://api.github.com/repos/OWNER/REPO/actions/workflows/collector-v2.yml/dispatches
```

Example request body:

```json
{"ref":"main"}
```

You will need a GitHub token with permission to dispatch workflows, but that token should live only in your scheduler configuration, not in this repository.

## Vercel Deployment

This project should be deployed to Vercel as a Next.js app.

Recommended setup:

1. connect Vercel to the `main` branch
2. set framework preset to `Next.js`
3. set `MONITOR_REMOTE_DATA_URL` to the GitHub contents API URL for `public/data/dashboard.json` on the `collector-data` branch
4. redeploy after changing code or environment variables

For a public repository, `MONITOR_REMOTE_DATA_TOKEN` is optional.

Example `MONITOR_REMOTE_DATA_URL` format:

```text
https://api.github.com/repos/OWNER/REPO/contents/public/data/dashboard.json?ref=collector-data
```

## Operational Notes

- The source site rotates dates over time, so a collection run needs to stay open long enough to observe multiple date responses.
- The current one-shot window is tuned to capture a full rotation with buffer.
- The dashboard shows absolute timestamps in Peru time, but relative strings such as `x minutes ago` are still relative to the current moment.
- If the collector writes no new data during a run, the workflow exits without creating a new data commit.

## Troubleshooting

### The dashboard shows empty data

Check the following:

- the collector has run at least once
- `collector-data` contains `public/data/dashboard.json`
- `MONITOR_REMOTE_DATA_URL` is set correctly in Vercel
- the deployed app has been redeployed after env var changes

### The workflow runs but does not push data

Check the following:

- GitHub Actions has `Read and write permissions`
- the workflow can push to `collector-data`
- the run actually captured new snapshots

### Times look wrong

Absolute display times are intentionally shown in Peru time. Look for the timezone badge in the dashboard header.

## Scripts Reference

- `npm run dev` starts the Next.js development server
- `npm run build` creates a production build
- `npm run start` starts the production server
- `npm run collector` runs the long-lived collector locally
- `npm run collector:once` runs a single collector session
- `npm run export:data` exports dashboard JSON from collected snapshots
- `npm run lint` runs ESLint