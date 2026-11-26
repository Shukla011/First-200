# Toggle Wars submission draft

**Project title** First 200 — From API Error to First Success

**Track** Track 1 · Test Something Real

**Flagsmith components verified** Feature flags and Experimentation. The recorded test used open-source Flagsmith and its local PostgreSQL warehouse.

## Project description

An authentication error can stop a developer before they make their first successful API call. I built First 200 to help API onboarding teams test where to put the fix. Flagsmith assigns the same guidance either beside the console or below the real 401 response. When a developer retries successfully within 60 seconds, Flagsmith joins that 200 to the original exposure. The judge can reproduce both layouts and follow the events into the dashboard using the free local setup.

## Track details

I hypothesized that help directly below the error would increase the share of exposed visitors who reach 200 OK within 60 seconds. The enabled Flagsmith flag `error_help_placement` assigns `troubleshooting_panel` and `inline_fix` at 50% each. The primary metric is unique exposed visitors with a qualifying `first_200_success` event divided by unique exposed visitors in each group.

On November 27, 2026 IST, an isolated QA environment recorded 12 simulated exposures. In the troubleshooting panel group, 3 of 5 browsers qualified (60.0%). In the inline group, 3 of 7 qualified (42.9%). The difference was −17.1 percentage points. These scripted sessions verified assignment, SDK event delivery, and aggregation in Flagsmith. The usability result is inconclusive with zero human sessions, so I would keep the experiment running for a human sample before changing the default.

The reproducible judge command independently verified the same pipeline in a fresh QA environment. Flagsmith counted 1 timely success from 2 exposures in each group. The script also checked that successful late retries and duplicate sends produced zero extra conversions. The human pilot has its own environment and a fixed task protocol.

## What to show judges

1. Open on the blank request and send it. Show the real 401 and its JSON response.
2. Show both placements and the identical guidance. Use distinct browser sessions, with Flagsmith serving the assignments.
3. Paste the dummy header and show the 200. Open the Flagsmith dashboard and show the running 50/50 split and both groups’ counts.
4. Identify the sample as simulated, say what it verified, and explain that the default stays in place until the human pilot gives a reason to change it.

## Submission checklist

- [ ] Publish the source to a public GitHub repository and verify the README opens while signed out.
- [ ] Upload the [local demo video](../demo/first-200.mp4) to YouTube or Loom with public or unlisted visibility and verify playback while signed out.
- [ ] Answer the actual feedback prompt and submit with the public links.
- [ ] Verify the confirmation screen. Submissions close Sunday, November 29, 2026 at 8 p.m. IST. [Official schedule](https://www.wemakedevs.org/hackathons/flagsmith/schedule)
