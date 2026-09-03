# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Apex Gains: a personal workout tracker (exercise library for a BowFlex
PR1000, rowing machine, and treadmill; reusable workout templates;
day-slot routines that cycle from an anchor date; per-set logging;
history). Auth is Google OIDC with open signup.

Stack: React Router v8 (Framework Mode), TypeScript, PostgreSQL
(hosted on Supabase), Drizzle ORM, Tailwind v4 + shadcn/ui, Podman.

## Commands

```bash
npm run dev           # dev server with HMR, http://localhost:5173
npm run build          # production build
npm run start           # serve a production build (build/server/index.js)
npm run typecheck        # react-router typegen, then tsc
npm run db:generate       # generate a Drizzle migration from app/db/schema.ts
npm run db:migrate         # apply pending migrations
npm run db:studio           # open Drizzle Studio against the local database
npm run db:seed              # seed/refresh the exercise library (idempotent)
npm run test                  # run the vitest unit test suite once
npm run test:watch             # vitest in watch mode
```

There is no lint/format tooling configured in this repo — `typecheck`
and `test` are the automated checks. Unit tests (vitest) live next to
the code they cover as `*.test.ts`; `app/test/mock.ts` exports a
`mock<T>(overrides)` helper for building partial test doubles without
`as any`/`as Type` casts scattered through test bodies, and
`app/test/db-chain.ts` exports `dbChain(result)` for stubbing a
Drizzle query chain (`db.select().from().where()...`) that resolves to
`result` however it's chained. Tests that touch `~/db/index.server` or
`app/auth/*` rely on `vitest.config.ts` seeding dummy `DATABASE_URL`/
`SESSION_SECRET`/etc. env vars — the postgres-js client and
`createCookieSessionStorage` are both lazy, so nothing dials out.
`dev` and `db:*` scripts load `.env` via `dotenv-cli`; `start` does
not (a container gets its environment from the runtime, not a bundled
`.env`).

Database: a hosted Supabase Postgres project (`DATABASE_URL` is its
Session pooler connection string — IPv4-compatible and supports
prepared statements, unlike the transaction pooler; the direct
connection is IPv6-only). `.github/workflows/build.yml` runs
`drizzle-kit migrate` against it on every push to `main` via the
`migrate-database` job (the `DATABASE_URL` repo secret), so schema
changes ship on merge. The app itself is hosted on Azure Container
Apps (`apex-gains` app in the `rg-apex-gains` resource group, Canada
Central, scale-to-zero), served at apex.atomic-nucleus.com via a
custom domain with an Azure-managed certificate (DNS zone in
`DefaultResourceGroup-CCAN`), and deployed by the same workflow's `deploy`
job, which runs after `migrate-database` and `build` and points the
Container App at the image `build` just pushed to GHCR (public, so no
registry pull credentials are needed) via `az containerapp update`,
authenticating to Azure with OIDC federated credentials (no stored
client secret). Every push to `main` is a full deploy — see README.md
"Hosting" and "Database migrations and deployment in CI" for details.
For local dev without
depending on Supabase, run local Postgres instead: `podman play kube
deploy/postgres-pod.yaml` (down with `--down`; data persists in the
`apex-gains-db-data` podman volume) and point `DATABASE_URL` at it.
Built with `containerfile` (not `Dockerfile`) — this project targets
Podman, not docker-compose. See README.md for full first-time setup
(env vars, Google OAuth client, etc).

## Architecture

**Routing.** `app/routes.ts` is the single route manifest (Framework
Mode, not file-system routing). All authenticated pages are nested
under the `routes/_protected.tsx` layout, which sets
`requireUserMiddleware` (`app/auth/require-user.server.ts`) to redirect
anonymous requests to `/auth/google`. The current user is threaded
through via React Router's context API: `app/auth/user-context.ts`
defines `userContext`, populated by `loadUserMiddleware` (see Auth,
below) and read in loaders/actions with `context.get(userContext)`.
Route modules import their generated types
from `./+types/<route-file-name>`.

**Data layer.** `app/db/schema.ts` is the single Drizzle schema
(Postgres). Route loaders/actions talk to `app/db/index.server.ts`
(`db`) directly — there is no repository/service layer. Non-trivial
read queries that combine multiple tables (e.g. "what's today's
workout") live in `app/lib/*.server.ts` (`todays-plan.server.ts`,
`week-summary.server.ts`) rather than inline in routes.

**Sample data and fork-on-write.** `exercises`, `templates`, and
`routines` rows with a null `userId` are seeded sample/system data
shared read-only by every account; `app/lib/sample-data.server.ts`
exports the `sampleOrOwn*Where` query-condition helpers (own rows plus
any not-yet-forked sample rows) and the `fork*ForUser` helpers, which
copy a sample row (and its children — equipment links, template
exercises, routine slots) into a real per-user row with `forkedFromId`
pointing back at the sample the moment a user edits it; the sample
original is then excluded from that user's view so the same logical
item doesn't show twice. Because of this, "does this row's `userId`
match the current user" isn't quite the whole authorization story —
scoped loaders must also decide whether to include the null-`userId`
sample rows via these helpers.

**Domain model shape**, roughly nested:
`templates` (a named list of exercises with target sets/reps/weight or
duration/speed/resistance, owned by a user) → `routines` (a named,
ordered cycle of `routineSlots`, each slot either referencing a
template or standing for a rest day) → `workoutSessions` (one row per
user per calendar date, snapshotting which routine/template applied
that day) → `sessionSets` (individual logged sets, one row per set —
not per exercise — so pyramids/drop-sets are representable; template
"targets" just pre-fill the logging form, every field stays editable
per set). `exercises` carry an `exerciseType` (`strength` | `cardio`)
and link to `equipment` via `exerciseEquipment`; cardio fields differ
by equipment (treadmill: duration + speed; rowing: duration +
resistance — no distance/pace, since neither is reliably derivable
from what's tracked).

**Routines are day-count cycles, not weekdays.** A routine's "today"
slot is `(days since anchorDate) mod (slot count)` — see
`app/lib/cycle.ts` (`slotIndexForDate`). This is strict calendar-day
math done in UTC on `YYYY-MM-DD` strings: it does not pause for missed
days, and a routine's `anchorDate` can be set independently of when it
was activated or of what weekday it falls on. Only one routine per
user may have `isActive = true` (enforced by a partial unique index in
the schema); `getTodaysPlan` in `app/lib/todays-plan.server.ts` is the
canonical read path from "active routine" to "today's exercises."

**Route module action pattern.** Routes with multiple mutations use a
single `action` with an `intent` hidden field dispatched via
if/else-if (see `app/routes/routines.$routineId.tsx` for the fullest
example: rename, reanchor, activate/deactivate, addSlot, removeSlot,
move, delete). Each branch validates its own `formData` with a local
Zod schema. Reordering (`move`) uses a 3-step position swap through a
scratch value (`-1`) inside a `db.transaction` to dodge the
`(routineId, position)` unique constraint. Every mutating form is a
plain `<form method="post">` (no client-side fetchers for these), and
`~/components/ui/submit-button.tsx` (`SubmitButton`) infers its own
pending state from `useNavigation()` matched against a `match={{
intent: "..." }}` prop — pass `match` whenever a page has more than
one form, or every submit button on the page will spin together.

**Auth.** Google OIDC via `openid-client` (`app/auth/oidc.server.ts`,
`oidc-state.server.ts`), session stored as a signed httpOnly cookie
(`app/auth/session.server.ts`). `loadUserMiddleware`
(`app/auth/current-user.server.ts`) reads the session and populates
`userContext` on every request (registered in `root.tsx`'s
`middleware` export, ahead of `requireUserMiddleware` which only the
`_protected` layout adds). Any Google account can sign in (open
signup) — a `users` row is created on first login. There is no
role/permission system; all authorization is "does this row's
`userId` match the current user" (see `loadOwnedRoutine`-style loaders
that scope every query by `userId` before returning 404) plus the
sample-data fork rule above. Azure Container Apps terminates TLS at
its ingress and forwards plain HTTP, and `react-router-serve` never
enables "trust proxy", so `request.url` in the OAuth callback route
looks like `http://...` even for real `https://` requests;
`app/routes/auth.google.callback.tsx` rebuilds the URL passed to
`authorizationCodeGrant` from the `ORIGIN` env var instead of the raw
`request.url` so the token exchange's `redirect_uri` matches what's
registered with Google.

**UI.** shadcn/ui primitives (Radix + `class-variance-authority`) live
in `app/components/ui/`; layout chrome (`Page`, `PageHeader`,
`Section`) is in `app/components/layout/page.tsx`. Design tokens
("Volt on Graphite" theme: warm-neutral graphite base, one rationed
volt accent for active states/focus rings/progress, dark mode via
`.dark` class) are defined once in `app/app.css` — extend the token
set there rather than hardcoding colors in components. Path alias `~/`
maps to `app/` (see `tsconfig.json` and `components.json`).
`app/components/nav-progress.tsx` drives an NProgress bar off
`useNavigation()` so client-side transitions get a loading indicator.

**Logging.** `app/lib/logger.server.ts` exports a base `pino` logger
(JSON on stdout/stderr everywhere except `development`, where it pipes
through `pino-pretty`; Azure Container Apps ships stdout JSON straight
into Log Analytics) and `requestLoggingMiddleware`, registered first
in `root.tsx`'s `middleware` export, which binds a per-request child
logger (with a `requestId`) into `loggerContext` and logs one
`"request completed"`/`"request failed"` line per request with
method/path/status/duration/userId. Route code that wants request-
scoped logging reads it via `context.get(loggerContext)` rather than
importing the base `logger` directly.

**Build info.** `app/lib/build-info.server.ts`'s `getBuildInfo()`
returns the `VERSION_TAG` env var (baked into the image as
`date-sha-buildnum` by `containerfile`/`build.yml`) or, outside a
container, the working tree's short git SHA. It's shown in the app
footer (`root.tsx`) and included in every log line's `build` field.
