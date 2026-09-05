# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Apex Gains: a personal workout tracker (exercise library for a BowFlex
PR1000, rowing machine, and treadmill; reusable workout templates;
day-slot routines that cycle from an anchor date; per-set logging;
history). Auth is Google OIDC with open signup. Administrators get an
`/admin` area on top: instance-wide stats and a user manager.

Stack: React Router v8 (Framework Mode), NestJS (server runtime/DI),
TypeScript, PostgreSQL (hosted on Supabase), Drizzle ORM, Tailwind v4 +
shadcn/ui, Podman.

## Commands

```bash
npm run build        # production build (application, then server runtime)
npm run build:application  # react-router build -> build/client + build/server/index.js
npm run build:server # bundle the Nest runtime -> build/server/main.js
npm run db:generate  # generate a Drizzle migration from app/db/schema.ts
npm run db:migrate   # apply pending migrations
npm run db:seed      # seed/refresh the exercise library (idempotent)
npm run db:studio    # open Drizzle Studio against the local database
npm run dev          # dev server with HMR, http://localhost:3000/ (Nest + Vite middleware mode)
npm run format:check # check formatting without writing
npm run format:write # format the repo with prettier
npm run preview      # build, then serve it - what the e2e suite runs against
npm run start        # serve the production build (node ./build/server/main.js)
npm run test         # run the vitest unit test suite once
npm run test:e2e     # run the Playwright end-to-end suite (chromium only)
npm run test:e2e:ui  # Playwright's interactive UI mode
npm run test:watch   # vitest in watch mode
npm run typecheck    # react-router typegen, then tsc
```

Run `npm run format:write` on any file you edit before finishing a
task - there is no lint tooling and no CI formatting check, so
`format:write` is the only thing keeping the tree consistent.
`typecheck`, `test` and `test:e2e` are the automated checks. Unit tests
(vitest) live next to the code they cover as `*.test.ts`; `test/mock.ts` exports a
`mock<T>(overrides)` helper for building partial test doubles without
`as any`/`as Type` casts scattered through test bodies. Most tests need
neither: the domain layer is pure, so its tests construct real
aggregates, and service tests wire real services to the in-memory
repository adapters rather than mocking a database - by constructing the
service class directly (`new RoutineService(...)`), not through Nest's
DI container, which tests never boot. `app/repositories/contract/` is the exception to that
last point: it states each port's promises once and runs them against
_both_ adapter families - the in-memory one inside `npm run test`, and
Drizzle against a throwaway Postgres named by `TEST_DATABASE_URL`
(`npm run test:contract`, skipped without it). It exists because every
service suite is built on the in-memory adapters, which would otherwise
be both the code under test and its own oracle; the behaviour only
Postgres can show - `on delete restrict`/`cascade`, per-statement unique
constraints, `onConflictDoNothing` - is imitated in-memory by naming the
referencing stores to each adapter (`repositories/in-memory/references.ts`),
wired in `server/repositories/repositories.module.ts`. See README.md
"Repository contract tests". `vitest.setup.ts` imports
`reflect-metadata` before anything else, since every service and
repository provider carries Nest decorators (`@Injectable()`/`@Inject()`)
that call into it at class-definition time - see Server runtime, below.
Tests that touch `~/db/index.server` rely on `vite.config.ts`'s `test`
block seeding a dummy `DATABASE_URL` - the postgres-js client is lazy,
so nothing dials out. That same block excludes `e2e/**`, since
Playwright specs are not vitest's to collect.

End-to-end tests (Playwright, chromium only) live in `e2e/` under
`playwright.config.ts` - a separate file because Playwright's runner
reads no other. Its `webServer` runs `npm run preview`, so specs drive a
production build rather than the dev server, on port 3100, with a blank
`DATABASE_URL` (so every port resolves to its in-memory adapter) and
`ENABLE_TEST_LOGIN=true` (so a spec signs in through `/auth/test-login`
rather than Google). Blank, not absent: `preview` hands node
`--env-file-if-exists=./.env`, and node leaves an already-set variable
alone, so `.env`'s real connection string cannot reach the suite.
Nothing seeds sample data in-memory, so specs build what they need
through the UI - which is why `exercise library > starts empty` doubles
as a check that no real database is in play. One server process
outlives the suite, so isolation is per-athlete: the `athlete` fixture
signs each test in as a fresh user. Every page is SSR'd, so anything
driven by client JS has to wait for hydration - `e2e/fixtures.ts` builds
that into `page.goto`/`page.reload`, and `submitForm` covers a
plain-form submit that follows another navigation. See README.md
"End-to-end tests". `dev` and `db:*` scripts load `.env` via `dotenv-cli`;
`start` passes node's `--env-file-if-exists`, so it picks one up
locally and shrugs in the container image, which ships no `.env` - a
container gets its environment from the runtime.

Database: a hosted Supabase Postgres project (`DATABASE_URL` is its
Session pooler connection string — IPv4-compatible and supports
prepared statements, unlike the transaction pooler; the direct
connection is IPv6-only). `.github/workflows/build.yaml` runs
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

## Comments

Comments describe the code as it stands. They are not a changelog - git
records what changed, and a docstring that argues with a previous version
is stale the moment nobody remembers that version. This applies to this
file too.

Never write:

- what the code replaced: "used to be spread across two adapters", "now
  a method rather than a free function", "replaces the old
  `requireEnv()` throws"
- that something was moved, renamed or deleted: "construction moved
  here", "see `server.ts`, deleted", "no longer needs a handle on the
  templates repository"
- how much a change consolidated: "six adapters each had their own
  check", "what used to be eight methods per adapter"
- a justification aimed at a reviewer rather than a reader: why this
  design was chosen _over the last one_, as opposed to what it now
  guarantees

Do write the thing a reader would otherwise have to rediscover, however
long it takes:

- an invariant the code depends on - "positions are always a contiguous
  `0..n-1` after any mutation"
- non-obvious platform or library behaviour - "Postgres checks a unique
  constraint per statement, so swapping two neighbours collides on the
  intermediate state"
- why an ordering, a cast, or an apparently redundant step is
  load-bearing, and what breaks without it
- a deliberate trade-off, stated as a present-tense constraint

The test: delete the sentence and ask whether a reader could still
predict what the code does and why it is shaped that way. If yes, it was
narration - leave it out. Describe the current design as if it had always
been this way, because that is the only version anyone has to work with.

## Architecture

**Routing.** `app/routes.ts` is the single route manifest (Framework
Mode, not file-system routing). All authenticated pages are nested
under the `routes/_protected.tsx` layout, which sets
`requireUserMiddleware` (`app/auth/require-user.server.ts`) to redirect
anonymous requests to `/auth/google`. Nested inside that,
`routes/_admin.tsx` adds `requireAdminMiddleware`
(`app/auth/require-admin.server.ts`) and holds the `/admin` pages.
The current user is threaded through via React Router's context API:
`app/auth/user-context.ts` defines `userContext` — which holds the
`Athlete` aggregate, not the raw `users` row, so loaders have the athlete's unit preferences and
behaviour to hand — populated by `loadUserMiddleware` (see Auth, below)
and read in loaders/actions with `context.get(userContext)`.
Route modules import their generated types
from `./+types/<route-file-name>`.

**Layers.** Four, strictly one-directional — `app/domain/` depends on
nothing, and nothing above it may be skipped:

```
app/domain/       pure TS. No Drizzle, no react-router, no I/O, no env.
app/repositories/ ports speak aggregates; adapters do mapping only.
app/services/     application services (use cases) + read models.
app/routes/       parse form -> call service -> map result to HTTP.
```

**Server runtime.** `server/` is the NestJS composition root: it
decides which adapter backs each port, wires everything together, and
hosts the actual HTTP server; it holds no business logic of its own
(that stays in `app/`, per the layers above). `server/main.ts`
bootstraps Nest, then either mounts Vite in middleware mode (dev) or
serves the built `build/client` output (prod) - both funnel non-static
requests to a React Router `createRequestHandler`, one process either
way. In dev `main.ts` builds that handler itself; in production it
imports the ready-made one from `build/server/index.js` (see Build
output, below). Repositories, `UnitOfWork`, and every `app/services/*.server.ts`
class are Nest-managed `@Injectable()` providers;
`server/repositories/repositories.module.ts` is the one place that
picks Drizzle vs. in-memory per repository (on whether
`databaseConfig.databaseUrl` is set) and the one place that calls
`configureDatabase()` with the validated connection string. The DI
_tokens_, though, live with the ports they name
(`app/repositories/tokens.ts`, `app/services/shared/tokens.ts`), not
here - that is what keeps `app/services` free of any `~server/`
import, so the application layer compiles and tests without its
composition root. Every `@Injectable()` constructor parameter is
`@Inject(TOKEN)`-tagged explicitly rather than relying on implicit
type-based DI: neither `tsx` (dev) nor Rolldown (the production
bundle) emits the `design:paramtypes` metadata Nest needs for that,
which is why
`tsconfig.json` deliberately does _not_ set `emitDecoratorMetadata`
(it would only imply a guarantee nothing honours); a class missing an
explicit token fails at DI-resolution time with a "Nest can't resolve
dependencies" error, not a type error. Environment variables are
validated once at boot with `class-validator`/`class-transformer`
(`server/config/`, one file per concern - core, database, Google
OAuth, session, test-login - each holding its schema class and the
`registerAs()` loader that validates it, with the shared
`validateConfigSlice` helper in `config/validate.ts`). A loader only
becomes an injectable token once it is listed in `AppModule`'s
`ConfigModule.forRoot({ load })`.

Two bootstrap invariants in `server/main.ts` are load-bearing and easy
to undo: `app.init()` runs _before_ the React Router handler is
mounted (that is where Nest registers controllers, and the handler is
a catch-all that would otherwise shadow them), which in turn requires
suppressing Nest's own catch-all 404 and creating the app with
`bodyParser: false` - React Router reads the raw request stream, so a
Nest body parser ahead of it would leave every form submission empty.

React Router's load context is the _only_ conduit from Nest to the app

- every service and Nest-validated config value reaches a route via
  `context.get(...)`, the same `createContext()` pattern as
  `userContext`. Repositories do not: nothing above the service layer
  holds a port.

The whole bridge is three pieces. `app/lib/nest-bridge.server.ts`
declares one `contexts` map, and derives from it the exported tokens,
the `NestSingletons` type, and `nestLoadContext(singletons)`, which
builds a populated `RouterContextProvider`; adding a service is one
edit there, and a missing one is a type error rather than an
`undefined` at request time.
`server/react-router/singletons.ts` pulls those values out of the DI
container at bootstrap (`collectNestSingletons(app)`).
`server/react-router/handler.ts` joins them: it is the React Router
build's own entry point, so it calls `nestLoadContext` from inside
`getLoadContext`.

That last placement is the load-bearing part. Nest and the routes are
always two separate module instances - in dev Nest runs under `tsx`,
outside Vite's module graph, while routes load through Vite's SSR
pipeline; in production the two are separate bundles (see Build
output, below) - so a `createContext()` token minted in `server/`
could never be `===` the token a route reads (`RouterContextProvider`
keys its map by token identity), and a provider minted there would
fail `handleRequest`'s `instanceof RouterContextProvider` check.
`handler.ts` reaches the same copies the routes do, which is why both
the tokens and the provider are built from there and `server/main.ts`
only supplies values.

Because the context is built before routing rather than by a
middleware, every context is set on _every_ request - including an
unmatched URL, which matches no route and so runs no middleware.

**Build output.** `npm run build` runs two Vite builds, and both inline
every dependency (`resolve.noExternal`), so `build/` is the entire
deployable - `node build/server/main.js` resolves no bare imports and
the container image ships no `node_modules`:

- `react-router build` (`vite.config.ts`) writes `build/client/` and
  `build/server/index.js`. Its SSR entry is not the default virtual
  server build but `server/react-router/handler.ts`
  (`environments.ssr.build.rollupOptions.input`), which exports
  `createHandler(singletons, mode)` over that virtual module, along
  with `assetsBuildDirectory` and `publicPath`.
- `vite.server.config.ts` writes `build/server/main.js` plus its
  `build/server/chunks/`, bundling `server/main.ts` and everything it
  reaches - Nest, Express, Drizzle, postgres-js, and a second copy of
  the `app/` tree. It runs second: `react-router build` clears `build/`
  first, and this build sets `emptyOutDir: false` so it lands beside
  the output already there.

The handler has to be built on the React Router side, because
`react-router` checks `initialContext instanceof RouterContextProvider`
with its _own_ class object - `getLoadContext` returning a provider
minted from the runtime bundle's copy would fail every request with
"Invalid `context` value provided to `handleRequest`". `main.ts`
reaches `index.js` through a path computed at runtime, which is also
what keeps either bundle from trying to resolve the other at build
time. Only `vite` stays external: `main.ts`'s dev branch loads it
through a dynamic import that production never reaches, and then loads
`handler.ts` itself through `vite.ssrLoadModule` - the same module,
from the same graph as the routes, in both modes.

That instance check is also why `vite.config.ts` inlines
`@react-router/express` into the dev SSR environment.
`react-router` publishes `development` and `default` export
conditions; Vite's dev SSR picks `development` where plain node picks
`default`, so leaving the express adapter external would put the
handler and the routes on two different copies of the class.

This is the general shape of a hazard that isn't unique to
`RouterContextProvider`: any value handed from a Nest provider to a
route through `nestLoadContext` carries the _Nest bundle's_ copy of
every class it was built from, not the route bundle's. A Nest provider
must never hand a route a raw instance of a third-party class that
itself runs `instanceof` checks - `openid-client`'s `Configuration` is
one such class, which is why `server/auth/oidc-client.provider.ts`
performs every `openid-client` call (`discovery`, `buildAuthorizationUrl`,
`authorizationCodeGrant`) itself and exposes only plain data (a `URL`,
a claims object) through `OidcClientProvider`. Handing whole service
instances across the same boundary (`AthleteService`, `RoutineService`,
...) is fine, because nothing on the route side checks their class
identity - it only calls their methods. `e2e/auth.spec.ts`'s "really
can build a Google authorization URL" test is the one spec that
exercises `/auth/google` against the real bundled build rather than
through `ENABLE_TEST_LOGIN`, specifically to catch a regression here -
typecheck and unit tests each run one layer in isolation and never load
the two production bundles side by side.

**Domain layer.** `app/domain/` holds the rules. Aggregates (`Routine`,
`WorkoutTemplate`, `WorkoutSession`, `Exercise`, `Equipment`, `Athlete`,
`BodyWeightEntry`) own their own invariants; value objects (`DateOnly`,
`Weight`, `Speed`, `Duration`, `SetTarget`, `Ownership`) stop raw
strings and unitless numbers leaking upward. Aggregates never reach for
identity or time — both arrive as ports (`IdGenerator`, `Clock`, bundled
as `DomainDeps` in `app/services/shared/deps.server.ts`), which is what
lets every rule be tested with no database and no mocks. Two shared
pieces carry most of the weight: `shared/ordered.ts` (`OrderedChildren`)
is the single implementation of append / remove-and-close-the-gap /
swap, and `shared/forking.ts` is the shape every `editableCopyFor`
returns. Cross-aggregate rules that belong to no single root are domain
services — see `domain/routine/activation.ts` and
`domain/athlete/administration.ts`.

**Data layer.** `app/db/schema.ts` is the single Drizzle schema
(Postgres). Repositories in `app/repositories/` are ports over
_aggregates_, not rows: `load` / `save` / `delete` plus real queries,
with a Drizzle adapter and an in-memory one each, selected once at Nest
bootstrap by `server/repositories/repositories.module.ts` (see Server
runtime, above) rather than by the port file itself. Adapters map
snapshots to rows and hold no rules. `save` receives the whole aggregate
rather than a change list, so it reconstructs the delta with
`shared/diff-children.ts`, and writes reordered children through
`shared/write-positions.ts` — a two-pass negative-scratch write, because
Postgres checks the `(parentId, position)` unique constraint per
statement and any permutation would otherwise collide mid-update.
Transactions are ambient: `UnitOfWork.run` publishes one via
`AsyncLocalStorage` (`app/db/transaction.server.ts`) and adapters query
through `dbScope`, never `db`, so writes stay inside it.

**Services.** `app/services/*.server.ts` are the use cases routes call
— `RoutineService`, `TemplateService`, `WorkoutLogService`,
`ExerciseLibraryService`, `TrainingPlanService`, `ProgressService`,
`AthleteService`, `BodyWeightService`, `AdminService`. They orchestrate
(load → hand off to the aggregate → save) and own no rules themselves.
`shared/exercise-directory.server.ts` is the read-side counterpart to
`shared/fork.server.ts`: a logged set, a template entry and a routine
slot all hold an exercise _id_ rather than an exercise, so every read
model that renders one joins the name back in through
`ExerciseDirectory` — which is also where the missing-exercise fallback
(`'Unknown'`, because history outlives the library) is stated.
`AthleteService` also covers sign-in: `signInWithGoogle` /
`signInWithEmail` find an athlete by identity or `Athlete.register`
one on first login, so no route touches `AthletesRepository` directly
(`loadUserMiddleware` goes through `AthleteService.byId`). Each is a
Nest-managed `@Injectable()` (see Server runtime, above); routes reach
one via `context.get(xServiceContext)` (the tokens live in
`app/lib/nest-bridge.server.ts`), never by importing the class or
constructing it themselves. **They return plain DTOs, never domain
objects**: React Router serializes loader data, so anything with methods
cannot cross that boundary. Chart view types live in
`app/services/progress-view.ts` (no `.server` suffix) precisely so client
components can import them.

**Sample data and fork-on-write.** `exercises`, `templates`, and
`routines` rows with a null `userId` are seeded sample/system data
shared read-only by every account — `Ownership` in
`domain/shared/ownership.ts` is where that null is interpreted, once.
Editing a sample copies it (with its children — equipment links,
template exercises, routine slots) into a per-user row with
`forkedFromId` pointing back at the sample; the original is then
excluded from that user's view so the same logical item doesn't show
twice. The copy is `aggregate.editableCopyFor(userId, deps)`; deciding
_whether_ to copy — reusing an existing fork instead of minting a second
one — needs a query, so it lives in
`app/services/shared/fork.server.ts` (`resolveEditableCopy`), which
every mutating service goes through. Because a fork's children get new
ids, an id that arrived on a form names a child of the _sample_; the
returned `translateChildId` maps it onto the copy by position. Around
that sits `ForkableEditor` in the same file, which owns the whole
sequence a mutation goes through — open a transaction, load what the
athlete can see, resolve the copy, apply, save, report `forkedId` — so
the three services construct one rather than restating it.
`ForkableLibrary` adds `remove` and `revert` for the two libraries whose
rows can simply be deleted; exercises keep their own `revert`, because
`on delete restrict` means theirs can refuse. Which
rows a list shows — own rows plus not-yet-forked samples — is
`LibraryVisibility` in `domain/shared/ownership.ts`, beside `Ownership`
itself: `selectFrom` answers it for the in-memory adapters, and because
SQL cannot call a predicate, `repositories/drizzle/shared/visibility.ts`
translates the same rule into one `where` builder the three forkable
tables share. The two readings are kept in step by tests, not by the
compiler. So "does this row's `userId` match the current user" isn't
quite the whole authorization story — scoped loaders must also decide
whether to include the null-`userId` sample rows.

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
from what's tracked). Which of the two a form offers is
`cardioFieldsFor` in `domain/equipment/cardio-fields.ts`, decided once
there: read models (`PlanItem`, `ExerciseView`) carry the resulting
`cardioFields` rather than the raw list of `cardioKind`s, so no route
re-derives it.

**Routines are day-count cycles, not weekdays.** A routine's "today"
slot is `(days since anchorDate) mod (slot count)` — `Routine.slotOn`
in `app/domain/routine/routine.ts`. This is strict calendar-day math
done in UTC on `YYYY-MM-DD` strings (`DateOnly`): it does not pause for
missed days, and a routine's `anchorDate` can be set independently of
when it was activated or of what weekday it falls on. Only one routine
per user may have `isActive = true`; that is a rule about a _set_ of
routines, so it lives in `domain/routine/activation.ts`
(`activateRoutine`) rather than on the aggregate, with the schema's
partial unique index as the backstop — the two routines it changes must
be saved in one transaction. `TrainingPlanService.planFor` is the
canonical read path from "active routine" to "today's exercises."

**Route module action pattern.** Routes with multiple mutations
declare their intents once with `intent()` (`app/lib/intent.ts`) and run
them through `dispatch`/`handled` (`app/lib/intent.server.ts`) — see
`app/routes/routines.$routineId.tsx` for the fullest example: rename,
reanchor, activate/deactivate, addSlot, removeSlot, move, delete. One
declaration derives everything that used to be a hand-typed string in
five places: `intent.field` is the hidden input, `intent.match` is what
`SubmitButton` compares against, `intent.reject(message)` is a tagged
400, and `intent.errorIn(actionData)` / `succeededIn` read the result
back in the component. `dispatch` reads the submission once, validates
the named intent's DTO, and hands the handler its data already parsed;
a handler still answers a redirect or a 404 by throwing. An intent the
page never declared is a 400, not a silent success. Single-form routes
(`routines.tsx`, `templates.tsx`, `admin.users.tsx`) post no `intent`
at all and call `validateForm` directly — there is nothing to dispatch
between. Each intent names a local
`class-validator` DTO class, checked through `validateForm`
(`app/lib/validate-form.server.ts`) — the same
`class-validator`/`class-transformer` pairing `server/config/` uses for
env vars (see Server runtime, above), so there is one validation
mechanism for the whole app rather than a second one only for forms.
`validateForm` returns `{ success: true; data }` or `{ success: false;
message }` instead of throwing, since a bad submission is a 400, not a
boot failure. Both fork-on-write detail routes build a
`forkableDetail(...)` (`app/lib/forkable-detail.server.ts`) naming their
noun and paths, and read the four shared HTTP mappings off it:
`notFound`, `settle` (not-found is a 404, and a non-null `forkedId` is a
redirect to the fork's own URL, since the edit would be invisible at the
sample's), `deleted` and `reverted`. Their shared header chrome — the
Sample/Customized badge and the revert-or-delete form that follows from
it — is `app/components/forkable-header.tsx`. What is left in each route
is what the two pages genuinely do differently: re-anchoring and
activating a routine, adding a targeted exercise to a template. Every mutating form is a
plain `<form method="post">` (no client-side fetchers for these), and
`~/components/ui/submit-button.tsx` (`SubmitButton`) infers its own
pending state from `useNavigation()` matched against a `match` prop —
pass `intent.match` whenever a page has more than one form, or every
submit button on the page will spin together.

Loaders and actions under the `_protected` layout read the athlete with
`requireAthlete(context)` (`app/auth/user-context.ts`) rather than
`context.get(userContext)!`. The context is nullable because
`loadUserMiddleware` runs on every request signed in or not; under the
layout `requireUserMiddleware` has already made the null unreachable,
and `requireAthlete` states that once instead of asserting it at every
call site. `home.tsx` and `auth.logout.tsx` are outside the layout and
read the nullable context directly.

**Auth.** Google OIDC via `openid-client`. The OIDC discovery
`Configuration` and the PKCE/state cookie are both built by Nest
providers (`server/auth/oidc-client.provider.ts`,
`oidc-state-cookie.provider.ts`) and reached via context
(`oidcConfigContext`, `oidcStateCookieContext`) - `oidc-client.provider.ts`
wraps discovery in a memoizing `get()` rather than resolving it eagerly
at Nest bootstrap, since it's a real network call to Google that
shouldn't block every server start. `app/auth/oidc-state.server.ts`
still holds the actual PKCE/state cookie serialize/parse logic, just
taking the `Cookie` as a parameter now instead of building its own.
Session storage is likewise a Nest provider
(`server/auth/session-storage.provider.ts`, reached via
`sessionStorageContext`). `loadUserMiddleware`
(`app/auth/current-user.server.ts`) reads the session and populates
`userContext` on every request (registered in `root.tsx`'s
`middleware` export, ahead of `requireUserMiddleware` which only the
`_protected` layout adds). Any Google account can sign in (open
signup) — a `users` row is created on first login.

Authorization has two levels and no role table. For an athlete's own
data it is "does this row's `userId` match the current user" (see
`loadOwnedRoutine`-style loaders that scope every query by `userId`
before returning 404), plus the sample-data fork rule above. Above
that sits a single `users.is_admin` flag, read as `Athlete.isAdmin`:
an administrator reaches `/admin` and, through it, every account.
`requireAdminMiddleware` is the only gate — the two queries that
deliberately ignore `userId` (`AthletesRepository.listAll` and
`WorkoutSessionsRepository.trainingTotals`) are reachable from nowhere
else, and a signed-in athlete without the flag gets a 404 like any
other row that isn't theirs. Who may hold the flag is a rule about the
whole set of athletes, so it lives in `domain/athlete/administration.ts`:
an administrator may act on any account but their own, which is also
what guarantees the instance can never be left with no administrator.
The first one has to be granted out of band — `update users set
is_admin = true where id = '…'` — since nothing in the UI can mint it
(e2e reaches for `/auth/test-login?admin=true`, which is gated behind
ENABLE_TEST_LOGIN like the rest of that route).

Azure Container Apps terminates TLS at
its ingress and forwards plain HTTP with `X-Forwarded-*` headers, so
`server/main.ts` (an Express server under Nest's `@nestjs/platform-express`
adapter, built on `@react-router/express` - see Server runtime, above)
enables Express's "trust proxy" — and also copies `X-Forwarded-Host`
onto the `Host` header before React Router sees the request, working
around a bug in `@react-router/express`'s request-building where it
falls back to the raw (proxy-internal) `Host` header's port whenever
`X-Forwarded-Host` lacks one. Without both pieces, `request.url`'s
origin wouldn't match the browser's `Origin` header on POSTs, which
React Router's built-in CSRF check rejects with a 400. The same two
pieces are also what let `app/routes/auth.google.tsx` and
`auth.google.callback.tsx` take `new URL(request.url).origin` as the
app's externally-visible origin — used to build and validate the OIDC
`redirect_uri` — rather than reading it from an env var.

**Units.** Measurements are stored canonically — pounds for weight,
km/h for speed, seconds for duration — and converted at the edges:
`Weight.in(unit, n)` on the way in, `AthletePreferences.formatWeight` on
the way out. The `numeric` columns carry no unit and postgres-js returns
them as strings, so nothing above the domain should ever see a bare
weight string or append a unit by hand. An athlete's `weightUnit` /
`distanceUnit` from /settings is the only thing that decides how a
number is rendered.

**UI.** shadcn/ui primitives (Radix + `class-variance-authority`) live
in `app/components/ui/`; layout chrome (`Page`, `PageHeader`,
`Section`) is in `app/components/layout/page.tsx`. Design tokens
("Volt on Graphite" theme: warm-neutral graphite base, one rationed
volt accent for active states/focus rings/progress, dark mode via
`.dark` class) are defined once in `app/app.css` — extend the token
set there rather than hardcoding colors in components. Path alias `~/`
maps to `app/`, `~server/` to `server/` (see `tsconfig.json` and
`components.json`).
`app/components/nav-progress.tsx` drives an NProgress bar off
`useNavigation()` so client-side transitions get a loading indicator.

**Charts.** Recharts, through shadcn's `app/components/ui/chart.tsx`
wrapper (`ChartContainer` + `ChartTooltipContent`) — a chart declares a
`ChartConfig` and paints with the `var(--color-<key>)` variables
`ChartContainer` emits from it, so the same component is themed by
`app.css` in both modes. The charts themselves are in
`app/components/history/`, and they render only in the browser:
`ResponsiveContainer` has to measure its box first, so an SSR'd page
shows the card and fills the plot on hydration. Two constraints are not
obvious. Bar animation is off, because Recharts restarts it whenever the
container resizes — a bar caught at t=0 has zero height, so anything that
observes the page (a screenshot, a resize) can catch an empty plot. And a
`LabelList` entry's `index` counts the rectangles that were drawn, not the
data points: a zero-value bar draws nothing, so a label that depends on
which point it belongs to must read `entry.payload`. The consistency
calendar in `consistency-heatmap.tsx` stays hand-drawn SVG — Recharts has
no heatmap — and carries its own tooltip in the same clothes as
`ChartTooltipContent`.

**Logging.** Nest's own `ConsoleLogger` is the only logger, built once
(`server/logging/logger.provider.ts`) and handed to `app.useLogger()`
in `server/main.ts`, so Nest's internal bootstrap lines
(`[NestFactory]`, `[InstanceLoader]`, ...) and the app's own share one
format. Output is plain text, never JSON; colour is enabled only when
stdout is a TTY, so a redirected stream does not collect ANSI escapes.
`LOG_LEVEL` names the least severe level to print and is validated
against Nest's own names - `verbose`, `debug`, `log`, `warn`, `error`,
`fatal` - so `log` is what other loggers would call "info", and an
unrecognised value stops the server at boot.

The logger reaches the React Router app via `nestLoggerContext`
(`app/lib/nest-bridge.server.ts` - see Server runtime, above), read
through `requestLogger(context)` in `app/lib/logger.server.ts`. That
is safe on every path, matched route or not, because the load context
is built before routing. `requestLoggingMiddleware`, registered first
in `root.tsx`'s `middleware` export so everything it wraps counts
towards the duration it reports, logs one line per request - `GET
/today 200 in 12ms for user <id>`. The process-wide
`uncaughtException`/`unhandledRejection` handlers live in
`server/main.ts`, which holds the logger directly; registering them
anywhere under `app/` would hook them inside the vitest process too.

Log lines are plain sentences with the values interpolated (`created
routine <id> for user <id>`), and the second argument is Nest's
context label - `Request`, `Auth`, `Routines`, `Templates`, `Today`,
`Process` - which prints in brackets. There is no structured-field or
correlation-id machinery: `logger.error` takes a stack string as its
second argument, so an `Error` is passed as `err.stack`.

**Build info.** `app/lib/build-info.server.ts`'s `getBuildInfo()`
returns the `VERSION_TAG` env var (baked into the image as
`date-sha-buildnum` by `containerfile`/`build.yaml`) or, outside a
container, the working tree's short git SHA. It's shown in the app
footer (`root.tsx`) and included in every log line's `build` field.
