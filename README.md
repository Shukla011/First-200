# First 200 — From API Error to First Success

First 200 is an API onboarding sandbox for teams that maintain developer quickstarts. It tests whether showing a fix beside an authentication error helps more beginners make their first successful request. A Flagsmith multivariate flag assigns each visitor to one of two help placements. The experiment counts successful retries within 60 seconds of exposure.

[Console screenshot](docs/troubleshooting-panel.png) · [Inline placement](docs/inline-fix.png) · [Local demo video](demo/first-200.mp4)

## Reproduce the experiment

Judges can run the same experiment locally with Node.js 22.12 or later and Docker Compose v2. The setup starts free, self-hosted Flagsmith on loopback and creates the running flag, metric, 50/50 allocation, and separate QA and human-pilot environments. It prints both dashboard links and stores the generated dashboard login in the ignored `.first-200/account.json` file.

```sh
npm ci
npm run setup:local
npm run dev:qa
```

Open the Vite URL and send the blank request. Follow the assigned guidance and send again. In a second terminal, run the following command with Google Chrome installed.

```sh
npm run verify:qa
```

The verifier uses fresh browser contexts and lets Flagsmith assign each one. It checks both placements, real response bodies, refresh persistence, a timely conversion, an expired conversion window, duplicate retries, and a 200 before exposure. It verifies the event acknowledgments and checks the dashboard’s refreshed counts. A successful refresh saves the result alongside the browser batch in `.first-200/qa-evidence.json`.

To start the separate human-pilot app, use `npm run dev:pilot`. The protocol fixes the task, cutoff procedure and decision criteria. [Human pilot protocol](docs/pilot.md)

Use `docker compose stop` when finished. If port 18180 is in use, set `FIRST_200_FLAGSMITH_PORT` consistently when running the local setup and verifier.

## Run locally

Use Node.js 22.12 or later and npm. The console works immediately with unmeasured troubleshooting guidance. A Flagsmith environment is needed for assignment and analytics.

```sh
npm ci
npm run dev
```

Open [the development app](http://127.0.0.1:5173). The Vite dev server starts the Node endpoint and proxies requests to it on the same origin. For a production build on the same machine, use the following commands.

```sh
npm run build
npm start
```

Open [the built app](http://127.0.0.1:4173). The Node server serves both the UI and API. It defaults to loopback and supports `HOST` and `PORT`. Run `npm test` for the endpoint and experiment state tests.

## Configure Flagsmith

Copy `.env.example` to `.env.local`, fill in the public **client-side** environment key, then restart development or rebuild the production bundle. Vite reads these settings at startup or build time. Management API credentials should stay in your Flagsmith account or CLI configuration.

| Variable | Use |
| --- | --- |
| `VITE_FLAGSMITH_ENVIRONMENT_ID` | Flagsmith client-side environment key |
| `VITE_FIRST_200_EXPERIMENT_RUN` | Browser storage namespace for this run. Change it when launching a new experiment in the same environment |
| `VITE_FLAGSMITH_API_URL` | Leave blank for Cloud. For a default local Flagsmith instance use `http://localhost:8000/api/v1/` |
| `VITE_FLAGSMITH_EVENTS_URL` | Leave blank for Cloud. For a default local instance using the Flagsmith database use `http://localhost:8000/api/` |

### Cloud dashboard setup

1. Create the **First 200** project and separate human and QA environments. Under **Environment Settings → Warehouse**, enable the managed Flagsmith warehouse and use **Send your first event**. Verify the warehouse connection before starting the experiment.
2. Create the enabled multivariate flag `error_help_placement`. Use `troubleshooting_panel` as the base value. Add both keyed variations, with each key matching its string value: `troubleshooting_panel` and `inline_fix`. Default variation weights can be zero outside the experiment.
3. Create a binary conversion metric for **First 200 within 60 seconds** and choose `first_200_success` as its event.
4. Create **First 200 · Error help placement** with the flag, attach the metric, and enroll 100% of eligible visitors. Assign 50% to each of the two explicit keyed variations, leaving 0% for the flag's implicit base value. Start the experiment and confirm it is running.
5. Connect the app to the matching environment and use fresh browser profiles for QA. After the first 401, check for `$flag_exposure`. After a timely retry, check for `first_200_success` with the same identifier. Refresh experiment results after ingestion.

The public Flagsmith pricing page lists A/B and MVT testing under paid plans. Check whether managed Experimentation is available in your Cloud account before configuring it. The fully free setup used for verification here was open-source Flagsmith in Docker with **Flagsmith database** selected as the warehouse. Use the two URL overrides above for that setup, substituting your local port. Repeat the same flag, metric, allocation, and start steps. [Cloud warehouse setup](https://docs.flagsmith.com/experimentation/connect-a-warehouse) · [Free self-hosted Flagsmith setup](https://docs.flagsmith.com/getting-started/run-locally-with-a-coding-agent) · [Flagsmith pricing](https://www.flagsmith.com/pricing)

## Endpoint and measurement

| Request | Status | JSON |
| --- | --- | --- |
| `GET /api/demo/profile` with a blank or incorrect Authorization header | 401 Unauthorized | `{"error":"Unauthorized"}` |
| The same request with `Authorization: Bearer first-200-demo` | 200 OK | `{"name":"Demo Developer"}` |

The token is public and the endpoint returns dummy data. The browser sends the typed header only to its own demo endpoint.

**Hypothesis.** Guidance directly beneath the error will increase the share of visitors who complete the task within 60 seconds.

Both groups see the same request, response and guidance. Group A sees the help in a troubleshooting panel beside the console on desktop and after it on mobile. Group B sees it immediately beneath the error response.

For each group, divide unique exposed visitors with a qualifying 200 by unique exposed visitors. A page load alone creates no exposure. The first rendered help starts the clock. Incorrect retries and reloads keep that timestamp, 60,000 ms qualifies, and each browser can record at most one qualifying success for the run. A 200 still completes the console task after the deadline or without exposure. The app stores an anonymous UUID, assignment, exposure timestamp, and completion marker per environment and run. It uses a local browser lock when available to coordinate simultaneous tabs.

An unavailable SDK, inactive experiment, unknown assignment, or blocked browser storage uses unmeasured troubleshooting guidance. Browser storage can be cleared, so a browser identity approximates a visitor. The SDK flushes events after exposure and conversion. The dashboard is the source of truth for ingestion, including cases where navigation or connectivity interrupts delivery.

## Results

**Human experiment.** Zero human visitors had been enrolled at the time of verification. Human conversion rates and percentage-point difference are N/A.

**Reproduction.** On November 27, 2026 IST, the automated judge command independently reproduced the experiment in a fresh self-hosted QA environment. Flagsmith recorded one timely success from two exposed browsers per variant. The other browser in each variant succeeded on screen after the 60-second window and produced no conversion. The command also checked that a 200 before any exposure produced no experiment event. [Reproduction dashboard](docs/flagsmith-reproduction.png)

**Recorded demo.** An earlier isolated self-hosted Flagsmith QA run recorded the following simulated counts on November 27, 2026 IST. The snapshot was computed at 2:06 a.m. IST and includes browser smoke and acceptance runs.

| Variant | Unique exposures | Within-window successes | Success rate |
| --- | ---: | ---: | ---: |
| A · Troubleshooting panel | 5 | 3 | 60.0% |
| B · Inline fix | 7 | 3 | 42.9% |

The difference (B minus A) was **−17.1 percentage points**. The scripted sessions chose which retries should qualify to validate the event pipeline. Flagsmith reported that it was still collecting data and displayed no win probability. The usability hypothesis remains inconclusive. Keep the allocation and metric fixed for a human run before deciding whether to change the default.

[Flagsmith results screenshot](docs/flagsmith-qa-results.png)

The recommendation remains to keep the troubleshooting panel as the default and run the human pilot before choosing a rollout. If human evidence consistently favors the inline fix, preserve the experiment results, end the experiment, and serve `inline_fix` with the same flag.

## Toggle Wars

Track 1 · Test Something Real. The verified Flagsmith components are **Feature flags** and **Experimentation**, using self-hosted Flagsmith for QA. The [submission draft](docs/submission.md) includes the measured result and the public-link checklist.
