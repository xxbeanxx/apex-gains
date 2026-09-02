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
  URI must be `<ORIGIN>/auth/google/callback` (`http://localhost:5173/auth/google/callback`
  for local dev).

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

| Script              | Purpose                                             |
| -------------------- | ---------------------------------------------------- |
| `npm run dev`         | Dev server with HMR                                   |
| `npm run build`       | Production build                                      |
| `npm run start`       | Serve a production build (`build/server/index.js`)    |
| `npm run typecheck`   | Generate route types and run `tsc`                     |
| `npm run db:generate` | Generate a Drizzle migration from `app/db/schema.ts`   |
| `npm run db:migrate`  | Apply pending migrations                               |
| `npm run db:studio`   | Open Drizzle Studio against the local database         |
| `npm run db:seed`     | Seed/refresh the exercise library                      |

## Environment variables

`dev`, `db:*` scripts load `.env` via `dotenv-cli` (host-side dev
convenience). The production `start` script does **not** - a container
gets its environment from the runtime (pod/host), not a bundled `.env`
file. See `.env.example` for the full list.

## Containerization

Built with `containerfile` (not `Dockerfile` - this project targets
Podman) and run locally for dev via `podman play kube` (not
docker-compose).

```bash
podman build -t apex-gains -f containerfile .
```

The app container needs `DATABASE_URL`, `SESSION_SECRET`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `ORIGIN` set in its
environment at runtime (e.g. via `-e` flags, a Kubernetes-style pod
manifest, or your host's secret store) - production deployment target
is not yet decided, so nothing beyond the image itself is prescribed here.

## Database migrations in CI

`.github/workflows/build.yml` has a `migrate-database` job that runs
`drizzle-kit migrate` against the Supabase project on every push to
`main` (after tests pass), using the `DATABASE_URL` repo secret. This
is the database half of continuous deployment; the app-deployment half
will be wired up once a hosting target is chosen.

## Architecture notes

- **Routines are cycles, not weekdays.** A routine is an ordered list
  of day-slots (each a template or an explicit rest day). "Today's
  slot" = `(days since anchor date) mod (slot count)` - see
  `app/lib/cycle.ts`. This is strict calendar-day math: it does not
  pause for missed days, and a routine's anchor date can be set
  independently of when it was activated.
- **Sets are logged individually**, not as one row per exercise, so
  pyramids/drop-sets are representable. Template "targets" pre-fill
  the logging form but every field is editable per set.
- **Cardio fields differ by equipment**: treadmill logs
  duration + speed; rowing logs duration + resistance (no
  distance/pace for either - not reliably derivable from what's
  tracked).
- Auth is Google OIDC only (`openid-client`), session via a signed
  httpOnly cookie. Any Google account can sign in (open signup); a
  user row is created on first login.
