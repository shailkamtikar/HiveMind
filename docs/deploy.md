# Deploying HiveMind

Target: Vercel for the app, a **separate** Supabase project for production data. Nothing here needs a paid plan; do not enable one without deciding first.

Everything marked **you** needs your accounts. Never paste keys into chat, issues or files in the repo; enter them in the dashboards.

## 1. Production Supabase project (you)

1. Create a new Supabase project, for example `hivemind-prod`. Note its project ref.
2. From your machine, apply every migration to it:
   ```bash
   npx supabase link --project-ref <prod-ref>
   npx supabase db push
   ```
   The migrations in `supabase/migrations` are the whole schema, including row security, functions and the realtime publication. Rollback scripts for each are in `supabase/rollback`. Take a Supabase backup or export before any later production migration.
3. Authentication > URL configuration: set **Site URL** to your Vercel URL and add `<vercel-url>/auth/callback` to the redirect URLs.
4. Authentication > SMTP: the built-in email sender is for trying things out (a few emails per hour, and only to your own team's addresses). **Set up custom SMTP** (any provider with a free tier will do) before friends use "Forgot your password?", otherwise their reset emails will not arrive. Also add `<vercel-url>/auth/callback` to the redirect URLs (step 3), because the reset link uses it.
5. Authentication > Passwords: turn on **leaked password protection** if your plan offers it.
6. Check the advisor: `npx supabase db advisors --linked --type security`. The expected output is in [`security.md`](security.md).

Afterwards `npx supabase link` points at production; re-link to your development project for local work.

## 2. Vercel project (you)

1. Import the GitHub repository (`main` branch).
2. Environment variables (Settings > Environment Variables). Set the **Production** values from the production Supabase project; set **Preview** values from the *development* project, so preview deployments never touch real data.

   | Variable | Production | Preview |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod project | dev project |
   | `SUPABASE_SERVICE_ROLE_KEY` | prod project, **sensitive** | dev project, **sensitive** |
   | `GEMINI_API_KEY` | key, **sensitive** | key, **sensitive** |
   | `GEMINI_MODEL` | `gemini-3.5-flash` | same |
   | `APP_BASE_URL` | the production URL, no trailing slash | leave unset for previews |

   `APP_BASE_URL` is the address put into reset-password emails and invitation links, so it must be your real domain, not `http://localhost:3000` (the value in `.env.local`). As a safety net, a production build ignores a localhost value when the request came from another address. The Supabase **Site URL** and redirect URLs (section 1, step 3) must be the same domain, because Supabase refuses to send people to addresses that are not on that list. When you add a custom domain later, change all three together.

   Only the first two are meant to be public. Mark the others as sensitive. `SUPABASE_DB_PASSWORD` is not needed on Vercel. Do **not** set `AI_MODE=mock` (it is ignored in production anyway).
3. Deploy. Function duration: the AI routes declare `maxDuration = 120`, within the 300 s the Hobby plan allows (see [`decisions/0001-ai-orchestration.md`](decisions/0001-ai-orchestration.md)).

## 3. Smoke test (you, with two real accounts)

1. Create account A on the production URL; start a conversation; send a message and see the AI reply.
2. As A, Share, tick the notice, create a link. Open it in a private window, create account B: B should land in the conversation and see the history.
3. Send from both; both see everything live, in the same order, with one AI reply each.
4. As A, revoke a link and confirm it stops working; open a conversation URL as a non-member and confirm a 404.
5. View page source and DevTools search for `service_role`, `AIza` and your project's secret key prefix: nothing should appear.
6. Check the production database has no `hm-test-*` users.

## 4. Costs and limits

The free tiers of Vercel, Supabase and Gemini are enough for a few friends. Look at the usage and spend alerts each dashboard offers and set them. Gemini's free tier can reuse conversation text; moving the Gemini project to a billed tier removes that and raises limits (see the privacy notes in the README).

## Rollback

Vercel: Deployments > promote the previous deployment (instant). Code: `git revert <hash>` and push. Database: run the matching script from `supabase/rollback` and repair the migration history with `npx supabase migration repair`, after taking a backup.
