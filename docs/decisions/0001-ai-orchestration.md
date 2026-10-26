# 0001: How AI replies are produced

Status: accepted (proceed). Checked: 2026-10-26.

## Decision

Keep the plan: a Postgres table (`ai_jobs`) is the queue, and a Next.js route on Vercel processes it one job at a time per group. No separate worker, no Render, no cron.

## Facts checked

| Question | Finding | Source |
|---|---|---|
| Max function duration on Vercel Hobby | 300 s default and maximum with Fluid compute (on by default). `export const maxDuration` is the documented way to set it in an App Router route. | https://vercel.com/docs/functions/configuring-functions/duration (updated 2026-08-24) |
| Cron on Hobby | Once per day at best, with up to an hour of jitter. Not usable for queue polling, so **we do not use cron**. | https://vercel.com/docs/cron-jobs/usage-and-pricing (updated 2026-07-15) |
| Gemini free-tier limits | Not published as numbers; limits are per project (not per key), measured in RPM, TPM and RPD, and shown in AI Studio. RPD resets at midnight Pacific. | https://ai.google.dev/gemini-api/docs/rate-limits |
| Gemini data use | On the **unpaid** tier Google may use prompts and responses to improve its products and human reviewers may read them. On the paid tier it does not. | https://ai.google.dev/gemini-api/terms |

## Model

`gemini-3.5-flash`, set with `GEMINI_MODEL`. The Flash-Lite models were tried first (the original plan) but were overloaded (HTTP 503) or took 18 to 60 s on the day they were measured. With `thinkingLevel: minimal` the default thinking time (30 s or more) disappears.

Five sample calls (short chat prompt, minimal thinking, 2026-10-26): 1.2 s, 1.5 s, 2.4 s, 4.3 s, 17.7 s. Min 1.2 s, median 2.4 s, max 17.7 s.

## Consequences

- p95 is well under the 300 s limit, so no persistent worker is needed. Each call gets a 25 s timeout.
- One processing request works through a group's queue until a time budget is used up (45 s), then reports `more: true`. Any member's browser can start another pass, so a dropped request is recovered by the next page load or reconnect.
- Jobs that were claimed but never finished (the function died) become claimable again after 90 s, at most 3 attempts.
- **Privacy:** because the project is on the free tier, everything said in a conversation can be used by Google to improve its products and read by reviewers. The share dialog already tells owners that messages are sent to Gemini. Before any public launch, either move the project to a paid tier or say so explicitly in the privacy page.
