# HiveMind --- Product Blueprint & Build Plan

**Document purpose:** This is the product blueprint for HiveMind. It
defines the intended user experience, product rules, constraints,
architecture boundaries, failure behavior, and the information or setup
required from the project owner. It is intended to help a developer or
coding assistant understand what the product should do before
implementation begins.

**This is not a command to start coding immediately.** First review the
owner-input checklist, confirm access and configuration, and resolve any
items marked as needing confirmation. Do not invent credentials,
silently choose paid services, or expose secrets in source code.

------------------------------------------------------------------------

## 1. Product summary

**Name:** HiveMind

HiveMind is a shared AI conversation space for friends. A person starts
chatting with an AI, then shares the conversation with other people. The
conversation becomes a group conversation: invitees can read the
existing history, send messages into the same conversation, and see all
other participants' messages and the AI's replies.

There is **one shared conversation and one AI context per group**.
Members do not get separate private AI sessions within the group. The
product is initially a portfolio/demo project for friends and
recruiters, not a paid SaaS business.

### Core promise

> Start a conversation with AI, invite people, and continue thinking
> together in one shared chat.

### Primary audiences

-   Friends testing the product together.
-   Recruiters reviewing the project and its product/engineering
    quality.
-   The project owner, who needs a maintainable and inexpensive demo.

### Out of scope for the first version

-   Payments, subscriptions, or monetization.
-   Multiple AI providers or automatic provider fallback.
-   File uploads, voice chat, image generation, or video.
-   Separate private AI threads within a group.
-   AI agents, tool execution, or autonomous workflows.
-   Complex organization/workspace administration.
-   Quota evasion, API-key rotation to bypass provider limits, or
    automated account cycling.

------------------------------------------------------------------------

## 2. Product decisions used by this blueprint

The following defaults are used to make the blueprint coherent. Where
the owner has not explicitly answered a choice, it is marked as a
**proposed default**, not as a confirmed personal preference.

  -----------------------------------------------------------------------
  Topic                   Blueprint default       Status
  ----------------------- ----------------------- -----------------------
  Shared conversation     Sharing converts the    Proposed default based
                          current conversation    on prior discussion
                          into the group          
                          conversation; no        
                          separate private        
                          continuation is         
                          promised                

  Join experience         Invite link plus        Proposed default
                          sign-in                 

  Identity                Google sign-in through  Proposed default;
                          Supabase Auth           provider setup required

  AI response behavior    AI responds to each     Proposed default
                          user message,           
                          processing requests     
                          sequentially per group  

  Concurrent messages     Server-side queue/order Proposed default
                          per group; avoid        
                          simultaneous AI turns   
                          against stale context   

  Group size              Configurable member     Proposed default; owner
                          limit; reject extra     must choose initial
                          joins with a clear      limit
                          explanation             

  Recruiter experience    Both a normal sign-in   Proposed default
                          flow and a safe demo    
                          experience, if the demo 
                          can be implemented      
                          without exposing        
                          private data or         
                          creating abuse risk     

  New members' history    New members can read    Proposed default
                          the group's prior       
                          messages                

  AI model                Gemini Flash-Lite       Owner preference; exact
                          family, exact currently model ID must be
                          supported model ID      verified
                          verified at             
                          implementation time     

  AI credentials          One server-side Gemini  Owner preference
                          API key                 

  Quota exhaustion        Show a clear            Owner preference
                          temporary-unavailable   
                          state; no quota bypass  

  Database                Supabase PostgreSQL     Proposed architecture

  Realtime updates        Supabase Realtime,      Proposed architecture
                          subject to prototype    
                          validation              

  Web deployment          Vercel, subject to      Proposed architecture
                          current plan/runtime    
                          limits                  

  Separate Render server  Not needed for the      Proposed architecture
                          first version unless    
                          technical validation    
                          shows a persistent      
                          backend is necessary    

  Monetization            None                    Confirmed project goal
  -----------------------------------------------------------------------

If the owner later changes a decision, update this blueprint before
implementation rather than mixing both behaviors into the product.

------------------------------------------------------------------------

## 3. Core user journeys

### 3.1 Start a conversation

1.  A user opens HiveMind.
2.  They sign in.
3.  They create a conversation/group or open an existing one they belong
    to.
4.  They send a message.
5.  The message is saved and shown in the conversation.
6.  The server requests an AI response using the configured Gemini
    model.
7.  The AI response is saved and delivered to all current group members.

### 3.2 Share a conversation

1.  The conversation owner chooses **Share / Invite people**.
2.  HiveMind creates an invitation link associated with that group.
3.  The UI explains that sharing makes the conversation shared and that
    invitees can see the existing history.
4.  The owner copies the link and sends it to friends.
5.  The invitee opens the link and signs in.
6.  The server validates the invitation and adds the user as a member if
    the invitation is valid and the group has capacity.
7.  The invitee sees the shared history and can participate in the same
    conversation.

The interface must make the privacy consequence clear before the first
conversion to a shared group. Do not imply that the original
conversation remains private after sharing if the product is using the
conversion model.

### 3.3 Participate in a group

1.  A member sends a message.
2.  The server verifies membership and validates the message.
3.  The message is persisted before it is broadcast to group members.
4.  The group AI queue processes the message in the correct order.
5.  The AI response is persisted and broadcast to all members.
6.  All clients converge on the same message history and ordering.

### 3.4 Reconnect

1.  A member refreshes the page or reconnects after losing network
    access.
2.  The app retrieves the authorized group's persisted history.
3.  Realtime subscriptions resume.
4.  The client avoids duplicating messages already loaded from history.
5.  Messages sent while disconnected are visible after reconnecting.

### 3.5 Recruiter/demo journey

A recruiter should be able to understand the product quickly without
being given access to the owner's private conversations or secrets. A
demo mode may use a clearly labelled seeded/demo group, but it must not
provide a shared unrestricted account or expose the Gemini API key. If
anonymous demo participation is supported, it must be rate-limited and
isolated from real users' groups. If that is too risky or complex for
the first version, provide a demo account or read-only demo instead.

------------------------------------------------------------------------

## 4. Functional requirements

### 4.1 Accounts and profiles

-   Use Supabase Auth.
-   Google sign-in is the proposed default; do not enable it until the
    owner configures the provider credentials.
-   Store only the profile fields the application needs, such as a
    display name and avatar URL.
-   Never trust a client-supplied user ID as proof of identity.
-   Membership and access decisions must be based on the authenticated
    server/session identity.

### 4.2 Groups and memberships

-   A group represents one shared AI conversation.
-   A group has an owner/creator and a set of members.
-   A member can view and send messages only in groups they are
    authorized to access.
-   The initial member limit must be configurable rather than hard-coded
    throughout the app.
-   If a group is full, show a clear message and do not add the member.
-   The owner can revoke an invitation.
-   Define owner-only actions explicitly: create/revoke invitation,
    manage membership where supported, and delete/archive a group if
    included in MVP.
-   Do not build complex roles unless needed; a basic owner/member
    distinction is sufficient.

### 4.3 Invitations

-   Invitation tokens must be unpredictable, high entropy, and stored
    safely (prefer storing a hash rather than a reusable raw token).
-   Invitations must be scoped to one group.
-   Validate token, expiry/revocation status, and group capacity on the
    server.
-   A copied or guessed group ID alone must not grant access.
-   A revoked, expired, malformed, or full-group invite must fail safely
    with an understandable UI message.
-   The product owner must decide whether invitations expire.
    Recommended initial behavior: allow owner revocation and configure
    an expiry policy; do not silently make permanent public links the
    only access control.
-   Avoid leaking full invitation tokens into analytics or application
    logs.

### 4.4 Messages

-   Persist messages with a stable ID, group ID, sender identity/type,
    content, creation time, and ordering metadata.
-   Distinguish user messages, AI messages, and system/status messages.
-   Validate and limit message length on the server.
-   Render user content as text by default; do not execute HTML or
    scripts from messages.
-   The database is the source of truth. Realtime events are
    notifications, not the only copy of a message.
-   Persist before broadcasting.
-   Clients must handle duplicate events and out-of-order delivery
    safely.
-   Provide clear loading, sending, retry, and error states.

### 4.5 AI responses

-   Use one AI context per group.
-   Every accepted user message enters a per-group sequential processing
    queue.
-   Do not allow two AI generations for the same group to race and
    produce confusing ordering.
-   Use the current persisted conversation history, subject to a defined
    context window.
-   Do not send unlimited history to Gemini. Start with a configurable
    recent-message window and leave room for a later summarization
    feature.
-   The server calls Gemini; the browser never calls Gemini directly
    with the secret API key.
-   Save the AI response before broadcasting it.
-   If generation fails, keep the user's message. Show that the AI could
    not respond and offer a retry action where safe.
-   Retries must not accidentally create duplicate AI responses. Use a
    stable request/job ID or equivalent idempotency mechanism.
-   If the provider returns quota/rate-limit errors, display a friendly
    temporary-unavailable message and stop retrying aggressively.
-   Do not rotate keys or accounts to bypass quotas.
-   Do not promise that the AI will answer every message instantly.
    Explain waiting/processing state when a queue is active.

### 4.6 Realtime behavior

-   Use Supabase Realtime initially for new-message notifications, after
    validating that the selected subscription approach supports the
    expected message volume and authorization model.
-   Realtime events must be authorized so a user cannot subscribe to
    another group's private messages.
-   Clients load history from the database and subscribe for updates;
    they do not rely on an uninterrupted socket connection.
-   Use database/server-controlled timestamps and a deterministic
    ordering field where necessary.
-   Validate RLS and subscription permissions with at least two test
    users in different groups.
-   If Realtime or the selected Vercel runtime cannot safely support AI
    job coordination, introduce a suitable server-side queue/persistent
    backend rather than attempting to coordinate jobs only in the
    browser.

------------------------------------------------------------------------

## 5. Architecture baseline

### Proposed stack

-   **Application:** Next.js + TypeScript.
-   **UI:** Tailwind CSS or another simple consistent component
    approach.
-   **Backend platform:** Supabase.
-   **Database:** Supabase PostgreSQL.
-   **Authentication:** Supabase Auth, with Google provider if
    configured.
-   **Realtime:** Supabase Realtime.
-   **AI:** Gemini Flash-Lite family through a server-side call.
-   **Deployment:** Vercel for the application, subject to current
    runtime limits.
-   **Source control:** Git repository controlled by the project owner.

### Responsibility boundaries

-   **Browser:** UI, local transient state, authenticated user
    interaction. No provider secrets.
-   **Server-side application routes/functions:** validate input, verify
    identity and membership, coordinate AI jobs, call Gemini, apply rate
    limits, and return safe errors.
-   **Supabase Auth:** identity and session management.
-   **Supabase PostgreSQL:** durable groups, memberships, invitations,
    messages, and AI-job/request state.
-   **Supabase Realtime:** notify authorized clients of persisted
    changes.
-   **Gemini:** generate AI responses only when called from the trusted
    server-side layer.
-   **Vercel:** serve/deploy the app and supported server-side
    functions.

### Important architecture constraint

Supabase Realtime is not, by itself, a durable job queue or a guarantee
of sequential AI processing. AI orchestration needs server-side
coordination and durable state. Before implementation, validate the
intended approach against the current Vercel execution-duration limits,
Gemini request latency, and Supabase plan limits. If those constraints
make a serverless function unsuitable, use a persistent worker/backend
or managed queue; do not quietly implement an unreliable in-memory queue
that loses jobs on process restart.

### Do we need Render?

Not necessarily for the initial version. Do not add Render merely
because it was mentioned earlier. Add a persistent service only if the
chosen server-side AI queue/worker design requires it or platform limits
make it necessary. Keep the architecture as simple as possible without
sacrificing correct message ordering and persistence.

------------------------------------------------------------------------

## 6. Data model --- conceptual requirements

The implementation may adjust exact SQL types and naming, but should
preserve these concepts.

### `profiles`

-   Auth user ID, linked to Supabase Auth.
-   Display name.
-   Optional avatar URL.
-   Created/updated timestamps.

### `groups`

-   Group ID.
-   Name/title.
-   Owner user ID.
-   Created/updated timestamps.
-   Status such as active/archived if supported.
-   Configurable member limit or a reference to the applicable limit.

### `group_members`

-   Group ID.
-   User ID.
-   Role (owner/member).
-   Joined timestamp.
-   Unique constraint preventing duplicate membership rows.

### `invitations`

-   Invitation ID.
-   Group ID.
-   Secure token hash.
-   Created by user ID.
-   Created timestamp and optional expiry.
-   Revoked timestamp/status.
-   Optional use limit if desired.
-   Never store a raw reusable invite secret unnecessarily.

### `messages`

-   Message ID.
-   Group ID.
-   Sender user ID when applicable.
-   Message type (user/assistant/system).
-   Text content.
-   Server-controlled creation timestamp.
-   Stable sequence/order metadata or equivalent deterministic ordering.
-   Optional AI request/job reference for generated messages.
-   Appropriate indexes for group history queries.

### `ai_jobs` or equivalent durable coordination state

-   Job/request ID.
-   Group ID.
-   Triggering user-message ID.
-   Status (queued/processing/succeeded/failed).
-   Attempt count and safe error category.
-   Created/updated timestamps.
-   Idempotency protection so retries do not duplicate successful
    responses.

This coordination state is important if AI jobs can outlive a single
request or need recovery after a timeout/restart. The precise mechanism
should be chosen after validating the hosting runtime. Do not rely
solely on an in-memory array or promise chain for production
correctness.

------------------------------------------------------------------------

## 7. Security and privacy requirements

Security is part of the product behavior, not an optional polish task.

-   Keep the Gemini API key server-side and out of browser bundles,
    client environment variables, Git history, screenshots, and logs.
-   Use separate development and production credentials where practical.
-   Keep Supabase service-role credentials server-side only. Never
    expose the service-role key in the client.
-   Use Row Level Security for user-facing database access.
-   Create and test explicit RLS policies for profiles, groups,
    memberships, invitations, messages, and any AI-job table.
-   Treat a group ID or invitation URL as a locator, not as sufficient
    authorization by itself.
-   Verify group membership on every protected server-side operation.
-   Validate input on the server even when the UI already validates it.
-   Apply reasonable message length and request-rate limits.
-   Avoid logging full conversation content, raw invite tokens, or
    secrets unless there is a clear need and appropriate protection.
-   Do not expose one user's private groups to another user.
-   Clearly disclose that messages in a shared group are visible to all
    its members and are sent to Gemini for AI processing.
-   Provide a way to revoke invitation links.
-   Define how group/message deletion works before launch. If deletion
    is implemented, specify whether it is soft or permanent and ensure
    related records are handled consistently.
-   Demo data must be separate from real user data. A recruiter must not
    be able to access private conversations through a demo path.

------------------------------------------------------------------------

## 8. Failure and edge-case behavior

  -----------------------------------------------------------------------
  Situation                           Required behavior
  ----------------------------------- -----------------------------------
  User is signed out                  Ask them to sign in before joining
                                      a protected group or sending
                                      messages

  Invalid/revoked/expired invitation  Show a friendly invalid-link
                                      explanation; do not reveal private
                                      group details

  Group is full                       Explain that the group has reached
                                      its member limit

  User is not a member                Deny access on the server, even if
                                      they know the group ID

  Duplicate invitation redemption     Do not create duplicate memberships

  Two people send messages at nearly  Persist both and establish a
  the same time                       deterministic order; serialize AI
                                      processing per group

  Database save fails                 Do not broadcast a message as
                                      successfully persisted; show
                                      retry/error state

  Realtime disconnects                Reconnect and reload missing
                                      history from the database

  Realtime event arrives twice        Client deduplicates by stable
                                      message ID

  AI provider is slow                 Show a processing state and respect
                                      platform timeout constraints

  Gemini quota/rate limit reached     Keep the user message; show
                                      temporary unavailability; avoid
                                      aggressive retries

  AI generation fails                 Persist failure/job state, keep the
                                      user message, and offer a safe
                                      retry

  Server function times out after AI  Use durable job/idempotency state
  response                            to prevent duplicate assistant
                                      messages

  User sends empty/oversized content  Reject it with an actionable
                                      validation message

  User attempts cross-group access    Deny access and record only safe
                                      diagnostic information

  Demo usage becomes abusive          Apply rate limits or disable public
                                      write access; do not let demo use
                                      consume unlimited quota

  Owner revokes an invite             New redemption attempts fail;
                                      existing members are not
                                      automatically removed unless the
                                      product explicitly defines that
                                      behavior
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 9. Performance, quota, and cost constraints

-   Aim for a free/low-cost portfolio deployment, but do not promise it
    will always be free.
-   Check current Supabase, Vercel, and Gemini plans and limits at
    implementation/deployment time.
-   Use one Gemini key and respect its quota.
-   Use bounded conversation context to manage token usage and latency.
-   Avoid sending the entire conversation history on every request.
-   Rate-limit message and AI-generation endpoints, especially for
    public demo access.
-   Avoid unbounded automatic retries.
-   Paginate or otherwise bound history loading for long conversations.
-   Establish reasonable configurable limits for message size, group
    membership, and AI context.
-   Provide a visible error when quota is exhausted rather than
    pretending a response is pending indefinitely.
-   Do not add paid infrastructure without asking the owner first.

------------------------------------------------------------------------

## 10. UI and usability expectations

The interface should be clean, responsive, and understandable without a
tutorial.

Minimum screens/states: 1. Landing page explaining HiveMind. 2. Sign-in
page/state. 3. Group/conversation list or home screen. 4. Conversation
screen with message history and composer. 5. Create group/conversation
flow. 6. Share/invitation flow with clear privacy warning. 7. Invitation
join/validation screen. 8. Group-full and invalid-link states. 9. AI
processing, AI unavailable, and retry states. 10.
Reconnect/loading/empty states. 11. Safe recruiter demo experience if
included.

The conversation view should make it clear who sent each message,
distinguish AI replies from member messages, and communicate when the AI
is still processing. Do not make system errors look like ordinary AI
answers.

------------------------------------------------------------------------

## 11. Testing and acceptance criteria

The product is not ready for demonstration until these behaviors have
been verified.

### Identity and access

-   A user can sign in and sign out.
-   A user can create a group.
-   A non-member cannot read messages by guessing a group ID.
-   A valid invite allows an authenticated invitee to join.
-   A revoked/invalid invite is rejected.
-   A full group rejects additional members.
-   A member cannot manage another group's invitations.

### Shared conversation

-   Two different users see the same persisted conversation.
-   A message from one user appears to the other without refreshing
    under normal connectivity.
-   The AI response appears to all group members.
-   A newly joined member sees the existing history according to the
    product's shared-history rule.
-   Refreshing or reconnecting does not erase messages or create
    duplicates.

### Ordering and AI

-   Near-simultaneous messages are stored and ordered deterministically.
-   AI jobs are processed sequentially per group.
-   A failed AI call does not delete the user's message.
-   Retrying a failed job does not create duplicate successful assistant
    replies.
-   Quota/rate-limit errors are understandable and do not trigger
    endless retries.
-   The API key is not present in browser network responses or client
    bundles.

### Security and operations

-   RLS is tested using at least two users and two separate groups.
-   The service-role key and Gemini key are never exposed to the client.
-   Invalid inputs and unauthorized requests are rejected server-side.
-   Demo access cannot reveal real user conversations.
-   Production deployment uses the intended environment variables and
    redirect URLs.

### Portfolio readiness

-   The project has a useful README explaining the product,
    architecture, setup, security model, and known limitations.
-   The demo has a clear path for a recruiter to explore it.
-   No real secrets or personal conversations are committed to the
    repository.
-   Any intentional limitations are disclosed honestly.

------------------------------------------------------------------------

## 12. Required owner inputs and setup checklist

**The implementer must ask for or verify these items before the
corresponding feature is configured.** Never ask the owner to paste
secret keys into a public repository, frontend code, a README, or an
ordinary chat when a secure secret-management interface is available.
The owner should enter secrets directly into the relevant provider
dashboard or deployment environment settings whenever possible.

### A. Product decisions to confirm

-   [ ] Confirm that sharing converts the original conversation into the
    shared group, rather than making a copy.
-   [ ] Confirm that joining requires sign-in.
-   [ ] Confirm Google sign-in as the initial authentication method.
-   [ ] Choose the initial group member limit (recommended: a modest
    configurable limit suitable for friends/testing).
-   [ ] Confirm AI behavior: respond to each message, one at a time.
-   [ ] Confirm new members can see the group's previous messages.
-   [ ] Choose whether invitations expire and, if so, the expiry period.
-   [ ] Decide whether the recruiter demo is read-only, demo-account
    based, or allows limited anonymous interaction. Recommended safest
    initial choice: a seeded read-only demo plus normal sign-in for live
    interaction.
-   [ ] Choose the initial maximum message length and recent-message
    context window; these should be configurable.
-   [ ] Confirm that no paid service should be enabled without explicit
    approval.

### B. Accounts and access the owner may need to create

-   [ ] A Git repository under the owner's account.
-   [ ] A Supabase account/project.
-   [ ] A Vercel account/project linked to the Git repository.
-   [ ] A Google Cloud project and OAuth client if Google sign-in is
    enabled through Supabase Auth.
-   [ ] A Google AI Studio/Gemini API credential for server-side model
    calls.
-   [ ] A domain name only if the owner wants a custom domain; it is not
    required for the initial demo.

Do not create accounts or accept paid upgrades on the owner's behalf
without permission.

### C. Supabase setup inputs

The owner or implementer must configure these in Supabase and record the
non-secret project settings: - \[ \] Supabase project URL. - \[ \]
Public/anon/publishable key intended for browser use, if required by the
selected Supabase SDK version. - \[ \] Server-side service-role/secret
key only if the chosen design truly requires it; keep it server-side and
never expose it to the browser. Prefer user-scoped server clients and
RLS where possible. - \[ \] Database schema/migrations. - \[ \] RLS
enabled and policies reviewed for every exposed table. - \[ \]
Authentication providers enabled. - \[ \] Site URL and allowed redirect
URLs configured for local development and deployed environments. - \[ \]
Realtime enabled/configured for the intended tables or channels. - \[ \]
Any database backup, pause/sleep, quota, or project limits understood
for the selected plan.

**Secret handling:** the owner should add secrets directly to local
environment files that are excluded from Git and to Vercel's
environment-variable settings. The implementer should request
confirmation that a secret has been configured, not request that it be
pasted into source code.

### D. Google OAuth setup, if selected

-   [ ] Google Cloud OAuth consent screen/app details configured as
    required.
-   [ ] Authorized redirect URI copied from Supabase's current Auth
    settings and entered into Google Cloud.
-   [ ] Local and production callback URLs tested.
-   [ ] Decide which test users are allowed while the OAuth app is in
    testing mode.
-   [ ] Confirm the public-facing app name and support/contact details
    if Google requires them.

Exact Google and Supabase setup screens can change; follow the current
provider instructions at setup time rather than relying on stale copied
URLs.

### E. Gemini setup

-   [ ] Create a Gemini API key in the appropriate Google AI developer
    console.
-   [ ] Confirm the current supported Gemini Flash-Lite model identifier
    and availability at implementation time.
-   [ ] Review the current free-tier/quota rules, region eligibility,
    and terms.
-   [ ] Store the key only as a server-side environment variable.
-   [ ] Choose a safe timeout, bounded context size, and rate limit.
-   [ ] Test quota/rate-limit and provider-error handling.
-   [ ] Never enable key rotation or account switching to evade quotas.

The implementer should ask the owner to configure the key in a secure
environment-variable interface and confirm that it is set. The owner
does not need to reveal the key value to the implementer or put it in
this document.

### F. Vercel/deployment setup

-   [ ] Link the Git repository to Vercel.
-   [ ] Configure the required environment variables for
    development/preview/production separately.
-   [ ] Set the production URL in Supabase Auth settings.
-   [ ] Confirm current Vercel runtime and request-duration limits are
    compatible with the AI orchestration approach.
-   [ ] Test deployment with no secrets in client bundles.
-   [ ] Decide whether a custom domain is needed (optional).
-   [ ] Confirm any cost/usage alerts or plan limits available on the
    selected account.

### G. Possible additional backend/worker setup

Do not create a Render service by default. First validate whether the
server-side queue can be implemented reliably within the selected Vercel
runtime and database capabilities.

If a persistent worker or separate backend is needed, ask the owner
before adding it: - \[ \] Confirm permission to create a Render service
or another suitable service. - \[ \] Choose a service/region and verify
current free/paid plan availability. - \[ \] Configure server-only
environment variables. - \[ \] Configure secure communication with
Supabase. - \[ \] Test job recovery, duplicate prevention, and
sequential processing. - \[ \] Explain any cost or sleep/latency
limitations to the owner before deployment.

### H. Final owner approval before public demo

-   [ ] Confirm the public demo's access model.
-   [ ] Confirm the data/privacy notice explains that group messages are
    visible to members and sent to Gemini for processing.
-   [ ] Confirm no private conversation or personal data is seeded into
    the demo.
-   [ ] Confirm whether users can delete groups/messages and what
    deletion means.
-   [ ] Confirm the expected member limit and rate limits.
-   [ ] Confirm the deployment is acceptable within the chosen plans and
    budget.

------------------------------------------------------------------------

## 13. Environment-variable handling

The final variable names must match the actual SDK and deployment
implementation. The following is a conceptual inventory, not a request
to paste values into this document.

  ---------------------------------------------------------------------------------------
  Variable category     Used by                        Secret? Notes
  --------------------- ---------------- --------------------- --------------------------
  Supabase project URL  Client and/or     No, generally public Must match the intended
                        server                   configuration project

  Supabase              Browser where         No, designed for Never treat it as
  publishable/anon key  appropriate        client use with RLS authorization by itself

  Supabase              Server only, if                **Yes** Bypasses normal RLS
  service-role/secret   needed                                 protections; minimize use
  key                                                          

  Gemini API key        Server only                    **Yes** Never expose to browser

  App base URL          Server/client as                    No Use correct
                        appropriate                            local/preview/production
                                                               value

  Optional queue/worker Server/worker                  **Yes** Only if a separate worker
  credentials           only                                   is approved
  ---------------------------------------------------------------------------------------

-   Include a `.env.example` containing names and placeholder values
    only.
-   Ensure actual `.env` files are ignored by Git.
-   Never put secret values in the blueprint, source control, public
    logs, screenshots, or demo data.
-   Rotate any credential that is accidentally committed or exposed.

------------------------------------------------------------------------

## 14. Implementation readiness gate

Before implementation starts, the implementer should:

1.  Review this blueprint with the owner and confirm the proposed
    defaults.
2.  Ask for missing product decisions and the setup items needed for the
    next milestone.
3.  Verify current Supabase, Vercel, and Gemini capabilities, model
    identifiers, quotas, and plan limits from official documentation.
4.  Choose and document a reliable server-side AI orchestration/queue
    design that preserves per-group order and survives request failures.
5.  Define database migrations and RLS policies before relying on
    client-side access.
6.  Keep all secrets out of client code and source control.
7.  Implement in small milestones and demonstrate the core behavior
    after each milestone.
8.  Ask before introducing paid services, additional providers, or a
    separate persistent backend.

### Suggested milestones (product outcomes, not coding commands)

-   **Milestone 1 --- Access:** users can sign in and create/join
    authorized groups.
-   **Milestone 2 --- Shared chat:** messages persist and appear to all
    authorized members in real time.
-   **Milestone 3 --- Shared AI:** Gemini responses use the group's
    context and appear to all members in a stable order.
-   **Milestone 4 --- Resilience and safety:** reconnect, retries, quota
    errors, RLS, rate limits, and invite revocation behave correctly.
-   **Milestone 5 --- Demo readiness:** recruiter-friendly experience,
    documentation, clean deployment, and no exposed secrets.

Each milestone should be tested before expanding scope.

------------------------------------------------------------------------

## 15. Official references to re-check during setup

Provider screens, model names, quotas, and hosting limits can change.
Verify current instructions when configuring the project:

-   Supabase documentation: https://supabase.com/docs
-   Supabase pricing: https://supabase.com/pricing
-   Supabase Auth documentation: https://supabase.com/docs/guides/auth
-   Supabase Realtime documentation:
    https://supabase.com/docs/guides/realtime
-   Supabase Row Level Security documentation:
    https://supabase.com/docs/guides/database/postgres/row-level-security
-   Vercel documentation: https://vercel.com/docs
-   Gemini API documentation: https://ai.google.dev/gemini-api/docs
-   Google AI Studio: https://aistudio.google.com/

------------------------------------------------------------------------

## 16. Definition of done

HiveMind is ready for its first public portfolio demonstration when:

-   A user can sign in, create a group, and share an invitation.
-   An invitee can join securely and see the shared history.
-   Multiple members can send messages and see one another's messages.
-   The group shares one coherent AI conversation.
-   AI requests are ordered, persisted, and recoverable without
    duplicate responses.
-   Database access is protected by server checks and tested RLS
    policies.
-   Gemini and Supabase secret keys are not exposed to the browser or
    repository.
-   Quota, timeout, connection, and invitation failures have
    understandable behavior.
-   The recruiter demo does not expose real private data or allow
    uncontrolled API usage.
-   The owner has approved the access model, data/privacy behavior, and
    any service that may incur costs.
-   Setup and deployment instructions are documented for future
    maintenance.

**North-star rule:** prioritize a small, reliable shared conversation
experience over extra features. If a feature compromises privacy,
message ordering, cost predictability, or the reliability of the shared
AI context, defer it.
