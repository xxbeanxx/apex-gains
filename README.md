# Apex Gains

A personal workout tracker: an exercise library for a BowFlex PR1000,
rowing machine, treadmill, and bodyweight exercises, reusable workout
templates, day-slot routines that cycle from an anchor date, per-set
logging, workout history and progress charts, body weight tracking, and
custom equipment management. Auth is Google OIDC (open signup).

Stack: React Router v8 (framework mode), NestJS (server runtime/DI),
TypeScript, PostgreSQL (hosted on [Supabase](https://supabase.com)),
Drizzle ORM, Tailwind CSS v4 + shadcn/ui, Podman.

## Local development

### 1. Configure environment

```bash
cp .env.example .env
```

Fill in:

- `DATABASE_URL` - the Supabase project's **Session pooler** connection
  string (Dashboard > Project Settings > Database > Connection string).
  Use the session pooler, not the transaction pooler or the direct
  connection - it's IPv4-compatible (the direct connection is IPv6-only)
  and, unlike the transaction pooler, supports the prepared statements
  `postgres-js`/Drizzle use. If you'd rather not depend on Supabase for
  local dev, run `podman play kube deploy/postgres-pod.yaml` instead
  (tear down with `--down`; data persists in the `apex-gains-db-data`
  podman volume) and point `DATABASE_URL` at that instead. If left unset,
  the app falls back to in-memory repositories (skipping database
  migrations and seeding).
- `SESSION_SECRET` - generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - from an OAuth client at
  https://console.cloud.google.com/apis/credentials. Authorized redirect
  URI must be `<the URL the app is served from>/auth/google/callback`
  (`http://localhost:3000/auth/google/callback` for local dev).

### 2. Install dependencies, migrate, and seed

```bash
npm install
npm run db:migrate
npm run db:seed
```

`db:seed` is idempotent - safe to re-run. (If running against in-memory
repositories without a database, skip `db:migrate` and `db:seed`.)

### 3. Run the app

```bash
npm run dev
```

App is at `http://localhost:3000/`.

## Scripts

| Script                      | Purpose                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `npm run build`             | Production build (application, then server runtime)                     |
| `npm run build:application` | Build the React Router app into `build/`                                |
| `npm run build:server`      | Bundle the Nest server runtime into `build/server/main.js`              |
| `npm run db:generate`       | Generate a Drizzle migration from `app/db/schema.ts`                    |
| `npm run db:migrate`        | Apply pending migrations                                                |
| `npm run db:seed`           | Seed/refresh the exercise library                                       |
| `npm run db:studio`         | Open Drizzle Studio against the local database                          |
| `npm run dev`               | Dev server with HMR at `http://localhost:3000` (Nest + Vite middleware) |
| `npm run format:check`      | Check code formatting with Prettier                                     |
| `npm run format:write`      | Format the repository with Prettier                                     |
| `npm run start`             | Serve a production build via `build/server/main.js`                     |
| `npm run test:watch`        | Run Vitest in watch mode                                                |
| `npm run test`              | Run the Vitest unit test suite once                                     |
| `npm run typecheck`         | Generate route types and run `tsc`                                      |

## Environment variables

`dev` and `db:*` scripts load `.env` via `dotenv-cli` (host-side dev
convenience), and `start` picks one up with node's
`--env-file-if-exists` if it is there. A container never gets one: it
takes its environment from the runtime (pod/host), and the image does
not ship a `.env`. See `.env.example` for the starter template.

Config values are validated at server startup using `class-validator`:

- `DATABASE_URL` - PostgreSQL connection string. Optional in local dev;
  defaults to in-memory repositories when unset.
- `SESSION_SECRET` - Secret used to sign session cookies (required).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OIDC client
  credentials (required).
- `PORT` - HTTP port to listen on (optional, defaults to `3000`).
- `HOST` - Bind address override (optional, binds to all interfaces if unset).
- `LOG_LEVEL` - Least severe NestJS log level to print (`verbose`,
  `debug`, `log`, `warn`, `error`, `fatal`; defaults to `log`).
- `ENABLE_TEST_LOGIN=true` - Turns on `GET /auth/test-login?email=...`,
  which signs in as a user by email (creating it on first use) without
  going through Google - it exists so Playwright/e2e runs can authenticate
  without a real Google account. It 404s unless the flag is set, and the
  flag must never be set on the deployed app: it is an unauthenticated
  login backdoor.

## Build output

`npm run build` produces two bundles, both with every dependency
inlined, so `build/` is self-sufficient - `node build/server/main.js`
needs no `node_modules`:

| Path                    | Built by                | Contains                                                        |
| ----------------------- | ----------------------- | --------------------------------------------------------------- |
| `build/client/`         | `react-router build`    | Browser assets, plus everything from `public/`                  |
| `build/server/index.js` | `react-router build`    | The React Router app and its ready-made Express request handler |
| `build/server/main.js`  | `vite.server.config.ts` | The Nest server runtime: DI, config, repositories, services     |

Two things keep that split honest:

- `server/react-router/handler.ts`, not `server/main.ts`, is the entry
  point of the React Router build, and it is where the request handler
  and its `getLoadContext` are constructed. `react-router` rejects a
  load context that is not an instance of _its own_
  `RouterContextProvider` class, and each bundle carries its own copy of
  the library, so a context built on the Nest side would fail every
  request.
- The runtime bundle reaches the application bundle by path, at
  runtime - `build/server/main.js` imports its sibling `index.js` - so
  neither build has to resolve the other.

## Containerization

Built with `containerfile` (not `Dockerfile` - this project targets
Podman) and run locally for dev via `podman play kube` (not
docker-compose).

```bash
podman build -t apex-gains -f containerfile .
```

The image contains the build output and nothing else - no
`node_modules`, no source - because both halves of the build inline
their dependencies (see **Build output**, below).

The app container exposes port `3000` and needs `DATABASE_URL`,
`SESSION_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` set in
its environment at runtime (e.g. via `-e` flags, a Kubernetes-style pod
manifest, or your host's secret store).

## Hosting

The app runs on Azure Container Apps (`apex-gains` app, in the
`rg-apex-gains` resource group / `cae-apex-gains` environment, Canada
Central), scaled to zero when idle, served at
[apex.atomic-nucleus.com](https://apex.atomic-nucleus.com) via a
custom domain with an Azure-managed certificate (the DNS zone lives in
`DefaultResourceGroup-CCAN`; a CNAME + `asuid.apex` TXT record point
it at the Container App's default `*.azurecontainerapps.io` hostname,
which still works directly too). The image is public on GHCR
(`ghcr.io/xxbeanxx/apex-gains`), so the Container App pulls it without
registry credentials. `DATABASE_URL`, `SESSION_SECRET`, and
`GOOGLE_CLIENT_SECRET` are stored as Container App secrets;
`GOOGLE_CLIENT_ID` and `PORT` are plain env vars. The app derives its
own origin from the request rather than an env var (Express's "trust
proxy" setting, since Azure's ingress terminates TLS and forwards
plain HTTP - see `server/main.ts`), so Google's OAuth redirect URI
(`https://apex.atomic-nucleus.com/auth/google/callback`) just needs to
be registered once in the Google Cloud console; there's nothing to
configure on the Container App for it.

## Database migrations and deployment in CI

`.github/workflows/build.yaml` runs three jobs after tests pass on a
push to `main`:

- `migrate-database` - applies pending Drizzle migrations to the
  Supabase project via `drizzle-kit migrate`, using the `DATABASE_URL`
  repo secret.
- `build` - builds and pushes the container image to GHCR.
- `deploy` - logs in to Azure via OIDC federated credentials (no
  stored client secret; `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and
  `AZURE_SUBSCRIPTION_ID` repo secrets identify the app registration
  and subscription) and runs `az containerapp update` to point the
  Container App at the image the `build` job just pushed. Migrations
  run before the deploy, so the new image never sees a schema it
  predates.

This is a straight rolling update - every push to `main` deploys.
There's no separate staging slot or manual promotion step.

## Architecture notes

- **A domain model owns the rules.** `app/domain/` is pure TypeScript
  with no database, no framework and no I/O: aggregates (`Routine`,
  `WorkoutTemplate`, `WorkoutSession`, `Exercise`, `Equipment`,
  `Athlete`, `BodyWeightEntry`) enforce their own invariants,
  `app/services/` orchestrates them, and `app/repositories/` only maps
  them to and from rows. Anything that can be decided without asking the
  database is decided in `app/domain/`, which is why most of the test
  suite runs without one.
- **Server runtime and composition root.** `server/` is the NestJS
  composition root: it handles dependency injection for repositories,
  services, auth providers, and logging; wraps Express; and bridges
  singletons into React Router via load context (`nestBridgeMiddleware`
  in `app/root.tsx`). In dev, it runs Vite in middleware mode with HMR;
  in production, it serves static assets and dispatches SSR requests to
  the request handler `build/server/index.js` exports.
- **Sample data uses fork-on-write.** Exercises, templates, and
  routines with a null `userId` are shared seed data available to every
  account. Editing a sample creates a user-owned copy with
  `forkedFromId` pointing back at the original, hiding the sample so the
  same logical item does not appear twice.
- **Routines are cycles, not weekdays.** A routine is an ordered list
  of day-slots (each a template or an explicit rest day). "Today's
  slot" = `(days since anchor date) mod (slot count)` - see
  `Routine.slotOn` in `app/domain/routine/routine.ts`. This is strict
  calendar-day math: it does not pause for missed days, and a
  routine's anchor date can be set independently of when it was
  activated.
- **Sets are logged individually**, not as one row per exercise, so
  pyramids/drop-sets are representable. Template "targets" pre-fill
  the logging form but every field is editable per set.
- **Measurements are stored canonically** (pounds for weight, km/h for
  speed, seconds for duration) and converted to user-selected units at
  the edges (`Weight.in`, `AthletePreferences.formatWeight`). An
  athlete's `weightUnit` and `distanceUnit` settings determine how
  measurements are rendered throughout the app.
- **Cardio fields adapt to equipment.** Equipment carries an explicit
  `cardioKind` (`speed`, `resistance`, or unset). Cardio logging and
  template-target forms adapt to show only the relevant fields (e.g.
  treadmill logs duration + speed; rowing machine logs duration +
  resistance). Unset or multi-purpose equipment shows both fields.
- **Body weight tracking.** Daily body weight entries are tracked over
  time with trend visualization and history, stored canonically in
  pounds and displayed in the user's preferred unit.
- **Auth is Google OIDC only** (`openid-client`), session via a signed
  httpOnly cookie. Any Google account can sign in (open signup); an
  athlete user row is created on first login.
