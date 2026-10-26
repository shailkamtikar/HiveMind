# HiveMind security notes

Last reviewed: 2026-10-26 (end of Phase 5). Applies to the dev Supabase project; the production project gets the same migrations.

## What we protect, and from whom

| Asset | Threat | Defence |
|---|---|---|
| Conversations (messages) | Someone who is not a member reads them | Row Level Security on every table; membership checked in the database, not only in the app. Non-members get the same "not found" as for ids that do not exist. |
| Conversations | A member edits or deletes history | Messages are append-only: no update or delete grants or policies. |
| AI replies | Someone posts a fake "HiveMind" message | Clients can only insert `type = 'user'` as themselves; assistant and system rows are written by server-only SQL functions. |
| Invitations | A leaked database or log reveals working links | Only a SHA-256 hash is stored; the hash column is not readable by clients; links expire (3 days) and can be revoked. |
| Invitations | Link scanners or previews use up a link | The join page redeems with a `POST` from a real signed-in browser, never on `GET`. |
| Group capacity | Two people race for the last seat | `redeem_invitation` locks the group row; tested 10 rounds in a row. |
| Gemini quota and cost | A member (or script) hammers the AI | Per-user limits in Postgres (20 messages/min, 6 AI calls/min), a 60 s group cool-down after a quota error, at most 3 attempts per message. |
| API keys | Keys reach the browser or git | Keys are only read in server code; `server-only` makes a client import a build error; `.env.local` is git-ignored; the history scan (`npm run scan:secrets`) is clean; the built client bundle contains no key. |
| Accounts | Guessing passwords | Supabase Auth rate limits sign-ins; wrong password and unknown account give the same message. |
| Pages | Clickjacking, injected scripts, referrer leaks | CSP, `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy`, no `Referer` on pages whose URL holds a token. Message text is rendered as plain text, never as HTML. |

## Authorization model (enforced and tested)

Tested by `tests/security/matrix.test.ts` (every table x anonymous / signed-in non-member / member / owner x select / insert / update / delete, 112 cells):

| Table | Read | Write |
|---|---|---|
| `profiles` | yourself and people who share a group with you | only your own display name / avatar |
| `groups` | members | owner renames or deletes; creation only through `create_group()` |
| `group_members` | members | nobody directly; joining only through `redeem_invitation()` |
| `messages` | members | members insert `user` messages as themselves; nothing else, nobody edits or deletes |
| `invitations` | owner only (never the hash) | nobody directly; `create_invitation()` / `revoke_invitation()` for the owner |
| `ai_jobs` | members (never the lock time) | nobody directly; server functions only |
| `rate_limits` | nobody | server only |

Routes are covered by `tests/security/routes.test.ts` (every file under `src/app/api` x signed out / non-member / member). The test fails if a route is added without being listed. Functions are covered by `tests/security/functions.test.ts`: the list of functions the API exposes is read from the running project and must match the reviewed list; anonymous callers can run none; signed-in users cannot run the four server-only ones.

## Security headers

Set in `next.config.ts` from `src/lib/securityHeaders.ts` for every path: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and, **in production builds only**, the Content-Security-Policy and HSTS.

Why the CSP and `X-Frame-Options` are production-only: with either present the Next.js development server (hot reloading, which renders pages in a frame to validate navigations) fell into an endless page-reload loop, and a policy loose enough to stop that would test nothing. The real policy is tested against a production build: `npm run test:csp` builds the app, starts it on port 3300, signs up, chats over the realtime websocket, opens the share dialog, and fails on any Content-Security-Policy violation reported by the browser (it passes). `/login` and `/join/*` override the referrer policy with `no-referrer` because their URLs can carry an invitation token.

**Known compromise:** the CSP allows `'unsafe-inline'` scripts, because Next.js injects small inline bootstrap scripts. A nonce-based CSP would remove this; it needs a request-time nonce from `proxy.ts` and is a good follow-up before a wide public launch. `'unsafe-eval'` is allowed in development only.

## Supabase Security Advisor (dev project, 2026-10-26)

`npx supabase db advisors --linked --type security` reported no errors:

| Finding | Level | Decision |
|---|---|---|
| `rate_limits` has RLS enabled and no policies | info | Intended: only the server touches it. |
| Seven `SECURITY DEFINER` functions are callable by signed-in users (`create_group`, `create_invitation`, `is_group_member`, `is_group_owner`, `redeem_invitation`, `retry_job`, `revoke_invitation`) | warn | Intended: each one reads `auth.uid()` itself and checks membership or ownership; none takes a user id from the caller. They are exactly the ones in `SIGNED_IN` in `tests/security/functions.test.ts`. |
| Leaked password protection is disabled | warn | A Supabase dashboard setting (Auth > Passwords). Turn it on if the plan offers it; it is not available on every plan. Owner action. |

## Known limitations (accepted, documented)

1. **Anonymous realtime pulse.** A signed-out client holding only the public key can receive an *empty* realtime event when any message is inserted (no ids, group, sender or text). That is Supabase behaviour and reveals only that something happened.
2. **Invitation tokens in URLs.** The token is part of the `/join/<token>` path, so it appears in Next's development request log and will appear in hosting request logs. The application never logs it. Mitigated by hashing, expiry and revocation.
3. **Email is not verified at sign-up.** Accounts are created already-confirmed so nobody waits on an inbox. Anyone can register an address they do not own. Acceptable for a small friends app; revisit before a public launch.
4. **Free-tier Gemini data use.** On the unpaid tier Google may use prompts and responses to improve its products, and human reviewers may read them. The share dialog tells owners that messages go to Gemini. Move to a paid tier, or state this on the privacy page, before a public launch (see `docs/decisions/0001-ai-orchestration.md`).
5. **Rate limiter fails open.** If the limiter's database call fails, the request is allowed (and a warning is logged). The limiter is protection, not a feature.
6. **Fixed-window limits.** A user can burst up to twice the limit across a minute boundary.
7. **CSP `'unsafe-inline'`** for scripts, see above.

## Logs

Server logs contain request lines and AI failure *categories* only. Verified after the full test run: none of the Gemini key, the Supabase service key or the database password appears in the dev server output; message text and prompts are never logged.

## Secrets

- `.env.local` is git-ignored; only `.env.example` (placeholders) is tracked.
- `npm run scan:secrets` searches all of git history for every credential in `.env.local` and for common key shapes, and prints no secret. Result on 2026-10-26: none found.
- **If a secret is ever committed:** rotate it in the provider's dashboard first, then remove it from history (`git filter-repo`). Reverting the commit is not enough.
- The service-role key is read in one file, `src/lib/supabase/admin.ts`, which imports `server-only`.

## How to re-run the checks

```bash
npm test                 # unit tests
npm run dev:test         # in another terminal: test server (AI off)
npm run test:db          # database, API and security matrix tests
npm run test:e2e         # browser tests (starts the test servers itself)
npm run test:csp         # production build with the real CSP, browser smoke test
npm run scan:secrets     # git history secret scan
npx supabase db advisors --linked --type security
```
