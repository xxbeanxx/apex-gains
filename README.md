# Apex Gains

A personal workout tracker: an exercise library for a BowFlex PR1000,
rowing machine, and treadmill, reusable workout templates, day-slot
routines that cycle from an anchor date, per-set logging, and history.
Auth is Google OIDC (open signup).

Stack: React Router v8 (framework mode), TypeScript, PostgreSQL
(hosted on [Supabase](https://supabase.com)), Drizzle ORM, Tailwind +
shadcn/ui, Podman.

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
  podman volume) and point `DATABASE_URL` at that instead.
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

`db:seed` is idempotent - safe to re-run.

### 3. Run the app

```bash
npm run dev
```

App is at `http://localhost:5173`.

## Scripts

| Script                | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `npm run dev`         | Dev server with HMR                                  |
| `npm run build`       | Production build                                     |
| `npm run start`       | Serve a production build (`build/server/index.js`)   |
| `npm run typecheck`   | Generate route types and run `tsc`                   |
| `npm run db:generate` | Generate a Drizzle migration from `app/db/schema.ts` |
| `npm run db:migrate`  | Apply pending migrations                             |
| `npm run db:studio`   | Open Drizzle Studio against the local database       |
| `npm run db:seed`     | Seed/refresh the exercise library                    |

## Environment variables

`dev`, `db:*` scripts load `.env` via `dotenv-cli` (host-side dev
convenience). The production `start` script does **not** - a container
gets its environment from the runtime (pod/host), not a bundled `.env`
file. See `.env.example` for the full list.

`ENABLE_TEST_LOGIN=true` turns on `GET /auth/test-login?email=...`, which
signs in as a user by email (creating it on first use) without going
through Google - it exists so Playwright/e2e runs can authenticate without
a real Google account. It 404s unless the flag is set, and the flag must
never be set on the deployed app: it is an unauthenticated login backdoor.

## Containerization

Built with `containerfile` (not `Dockerfile` - this project targets
Podman) and run locally for dev via `podman play kube` (not
docker-compose).

```bash
podman build -t apex-gains -f containerfile .
```

The app container needs `DATABASE_URL`, `SESSION_SECRET`,
`GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` set in its
environment at runtime (e.g. via `-e` flags, a Kubernetes-style pod
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

`.github/workflows/build.yml` runs three jobs after tests pass on a
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
  `WorkoutTemplate`, `WorkoutSession`, ...) enforce their own
  invariants, `app/services/` orchestrates them, and
  `app/repositories/` only maps them to and from rows. Anything that
  can be decided without asking the database is decided in
  `app/domain/`, which is why most of the test suite runs without one.
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
- **Measurements are stored canonically** (pounds, km/h, seconds) and
  converted to your chosen units at the edges, so the weight and
  distance settings apply everywhere rather than to one chart label.
  Values recorded before this was wired up are read as pounds and
  km/h - which is what they were, unless you had switched units and
  typed in the other one.
- **Cardio fields differ by equipment**: treadmill logs
  duration + speed; rowing logs duration + resistance (no
  distance/pace for either - not reliably derivable from what's
  tracked).
- Auth is Google OIDC only (`openid-client`), session via a signed
  httpOnly cookie. Any Google account can sign in (open signup); a
  user row is created on first login.
