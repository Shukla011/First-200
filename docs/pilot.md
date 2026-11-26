# First 200 human pilot

Run the pilot with volunteers who have used an API or are learning to use one and have yet to see First 200. In a local session, run `npm run setup:local` and `npm run dev:pilot`. For remote collection, use the same separately configured human environment and a reachable deployment. The QA and demo sessions use their own environment.

## Before collection

- Record the start date and cutoff in IST before the first visitor. Capture the results at that cutoff, through the experiment’s Results page, after events have been ingested.
- Check in Flagsmith that the two keyed variants receive 50% each and that the metric is the binary occurrence of `first_200_success`.
- Use a fresh browser profile or private window for each visitor. Close the entire private session before giving the app to the next visitor so they receive a new anonymous UUID.
- Keep the layout, split, wording, endpoint and 60-second window fixed for the run. If the app or connection fails, record the issue separately so you can explain whether the data covers the intended task.

## Run each session

Read the same prompt to each participant.

> Make this request return 200 OK.

Let visitors work independently. After the task, ask “Where did you look first after seeing the error?” Record brief observations without names or contact details. The Flagsmith result still uses the original 60-second conversion metric. Keep observations for context when interpreting the result.

## Report the outcome

Report the source, collection dates, unique exposures and qualifying successes in each group. Treat repeat sessions from people who already saw the app as a separate QA activity. Use N/A for a group with zero exposures and compute B minus A in percentage points when both groups have data.

Use the dashboard’s win probability, if available, alongside the group counts. If the sample is small or the evidence is inconclusive, keep the current default and collect more sessions. If evidence favors a layout, preserve the snapshot before ending the experiment, then set the winning value on `error_help_placement`.

| Variant | Human exposures | Within-window successes | Rate |
| --- | ---: | ---: | ---: |
| A · Troubleshooting panel | 0 | 0 | N/A |
| B · Inline fix | 0 | 0 | N/A |

Human enrollment at handoff is zero. The simulated results remain in the README and demo.
