# Implementation plan: nine features

Grounded in the code as it stands: four strict layers, fork-on-write over
sample rows, ports with a Drizzle and an in-memory adapter each, and plain
`<form method="post">` mutations dispatched through typed intents.

Totals: **5 migrations**, **2 new ports**, **2 new services**, **1 risk to
verify first**.

---

## Two findings before anything gets built

### Already shipped — dropped from the plan

Exercise library search and filtering exists. `app/routes/exercises.tsx`
renders a search input plus three `FacetFilter` columns (type, equipment,
source), and it already does the careful thing: each facet's counts are
computed from the pool the _other_ active facets narrow to, so the numbers
don't all converge. Nothing to do.

### Verify before shipping self-deletion (feature 07)

Deleting a `users` row cascades down two paths at once: to that athlete's
`exercises`, and to their `sessions` → `session_sets`. But
`session_sets.exercise_id` is `on delete restrict`. Postgres does not promise
an order between two independent cascade paths, so an athlete who logged a set
against an exercise they own may not be deletable at all.

The existing contract test _"removes an account and everything hanging off
it"_ (`app/repositories/contract/misc.contract.ts:73`) seeds only a body-weight
entry — it never exercises this. The admin delete path has the same exposure
today; self-deletion just puts it in front of every athlete.

**Add the case to the contract suite and run `npm run test:contract` against a
real Postgres before building anything else in Phase 4.** If it fails, the fix
is an explicit ordered delete inside `UnitOfWork.run` rather than leaning on
the cascade.

---

## Sequencing

Phases are ordered by real dependencies, not by value. Within a phase the order
is free.

| Phase | Features     | Why here                                                                                                                                     |
| ----- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 01 → 02 → 03 | All three touch `LogSetForm` and `LoggedSet`. Serialising them avoids three-way conflict in the same files.                                  |
| 2     | 04, 05       | Touch nothing the other features touch. Good candidates to interleave or hand off.                                                           |
| 3     | 06           | Needs the batched last-sets query 01 adds, generalised to _N_ sessions. Building it first would mean a third query shape over the same rows. |
| 4     | 07 → 08      | 08's `actor_id` foreign key has to be designed knowing accounts can now delete themselves.                                                   |
| 5     | 09           | Largest surface: new value object, new port, new preference, a route rename. Nothing blocks it; nothing depends on it.                       |

---

# Phase 1 — the logging loop

## 01 · Last-time prefill in the log form

`port change` · `2 adapters` · `contract test` · `no migration`

Today the log form renders blank inputs and `ExerciseHistoryButton` fetches
`/exercises/:id/history` into a dialog you read and then retype from.
`RecentSetView` carries only `{ date, summary }` — a formatted string, useless
for prefill. The fix is a structured sibling and a default value.

**Repository.** Add `lastSetPerExercise(userId, beforeDate)` to
`SessionsRepository`, returning `Map<exerciseId, { date, set }>` for every
exercise the athlete has ever logged. One query, not one per exercise —
Postgres `DISTINCT ON (exercise_id)` ordered by `date desc, created_at desc` is
exactly this shape.

**Service.** `SessionService.lastSetsFor(athlete, date)` →
`Record<exerciseId, LastSetView>`, where `LastSetView` mirrors `SetInput`:
numbers already converted into the athlete's own units, because that is the
shape the form posts back.

**Route.** One more entry in `today.tsx`'s existing `Promise.all`. Leave
`TrainingPlanService.planFor` alone — `SessionService.logSet` calls it on every
single set to snapshot the day's plan, and it should not gain a query.

**UI.** `LogSetForm` takes `lastSet` and resolves the prefill: the last set of
_this same day_ if there is one (already on the page in `loggedSets`),
otherwise the previous session's. Show it as a hint line — "Last time: 135 lb ×
8 on 2 Sep" — with a clear affordance.

> **The remount trap.** A fetcher submission does not reset its form, so
> uncontrolled inputs keep what was typed — which is _already_ the right
> behaviour for set 2 of 3. But the prefill has to update once `/today`
> revalidates. Key the field group so it remounts with the new default.
>
> Key the _fields_, not the whole form: the free-form picker holds `selectedId`
> in state above it, and remounting the form would throw the athlete's exercise
> choice away between every set.

**Tests.** Contract case in `sessions.contract.ts` (ties are broken by
`created_at`, and sets on the viewed date itself are excluded). Service test on
the unit conversion. One e2e in `today.spec.ts`: log a set, reload, assert the
field carries it.

---

## 02 · Set notes and an RPE column

`migration` · `value object` · `2 adapters` · `contract test`

`session_sets` records reps, weight, duration, speed and resistance — and
nothing else. "Rod 4 slipping" has nowhere to live, and without RPE the history
charts can't distinguish 135 × 5 at an easy effort from the same set at
absolute failure. Two nullable columns.

**Schema.** `notes text` and `rpe numeric(3,1)` on `session_sets`. Nullable, no
backfill.

**Domain.** New `app/domain/values/rpe.ts` following the `Weight`/`Speed` shape
exactly: `Rpe.of(n)`, `fromStorage`, `toStorage`, constrained to 1–10 in half
steps. Then thread both through `LoggedSetSnapshot`, `LoggedSet`,
`SetMeasurements` and `Session.logSet`.

**Formatting.** RPE belongs inside `LoggedSet.format` ("135 lb x 8 @ RPE 8").
Notes do not — they get their own line, so `LoggedSetView` gains `notes` and
`logged-sets-list.tsx` renders it beneath the summary.

**UI.** RPE as a small select beside reps and weight; notes as the existing
`textarea.tsx` primitive behind a disclosure, so the one-tap path stays one
tap. Cap length in `LogSetDto` with `@MaxLength(500)`; trim in the service.

> **Optional cleanup while you're in here.** `LoggedSet`'s constructor is nine
> positional parameters. These two make it eleven, and
> `new LoggedSet(id, exerciseId, 3, null, weight, null, null, 7, notes, rpe, now)`
> is a bug waiting to happen. Consider switching it to a single options object,
> keeping `fromSnapshot` as the public path. It touches `Session.logSet` and
> the domain tests and nothing else.

Leave `app/domain/progress/` alone for now. RPE becomes available to the metric
selection in `personal-records.ts`, but changing what a trend line _means_
mid-stream rewrites every existing chart. Separate change, separate decision.

---

## 03 · Rest timer between sets

`migration` · `client-side` · `preferences`

You log a set on a phone, then stand there. Nothing in the app tells you when
the next one starts. The timer itself is pure client state; the only server
work is deciding how long it runs for.

**Schema.** One migration, two columns: `users.default_rest_seconds` (nullable
— null means the timer is off) and `workout_exercises.rest_seconds` as the
per-exercise override.

**Domain.** `AthletePreferences` gains `restDuration: Duration | null`, reusing
the existing value object. `SetTarget` gains `rest` — it is genuinely "what the
workout suggests" — which means updating `isEmpty` and `format`. Note that rest
sits _outside_ the `cardioFields` filter in `Workout.updateTarget`: it applies
to strength and cardio alike.

**UI.** `app/components/session/rest-timer.tsx`, rendered inside the exercise
card between `SetProgress` and the form. Starts when the `logSet` fetcher goes
submitting → idle. Countdown, a skip, and a +30s.

**Settings.** A fourth section in `settings.tsx`'s `SECTION_IDS` for the
default.

> **Three constraints worth writing down.**
>
> Every page is SSR'd, so the timer must render nothing until hydrated or the
> server and client disagree about the remaining seconds on first paint.
>
> Persist the deadline — not the remaining count — in `sessionStorage`, keyed by
> exercise, so navigating away and back doesn't lose it and the arithmetic stays
> correct across a backgrounded tab.
>
> No audio. Autoplay policy blocks it without a prior gesture, and it's the
> wrong thing in a shared room anyway. `navigator.vibrate` behind a feature
> check is the right signal.

Extract `formatRemaining` and the deadline arithmetic as pure functions and
unit-test those; drive the component itself in e2e with Playwright's clock API
rather than real waits.

---

# Phase 2 — independent

## 04 · Installable on a phone

`no migration` · `needs icon assets` · `root.tsx`

`public/` holds a favicon and nothing else. This is an app used on a phone in a
room where browser chrome is in the way. A manifest and a proper icon set is an
afternoon.

**Assets.** `public/manifest.webmanifest` plus `icon-192`, `icon-512`,
`icon-maskable-512` and a 180×180 `apple-touch-icon`. Vite copies `public/`
into `build/client/` verbatim, which the production server already serves
statically — no build config to change.

**Manifest.** `display: "standalone"`, `start_url: "/today"` (the page you open
the app to reach), `scope: "/"`, `orientation: "portrait"`, and
`background_color`/`theme_color` taken from the graphite base in `app.css`.
Shortcuts to `/today` and `/history`.

**Head.** Populate `root.tsx`'s currently-empty `links` export with the
manifest and apple-touch-icon.

> **`theme-color` does not belong in a `meta` export.** React Router does not
> merge `meta` exports up the route tree — a child's `meta` _replaces_ the
> parent's unless it explicitly spreads `matches`. Every page here exports its
> own title array, so anything put in a root `meta` vanishes on every route.
>
> Write the two theme-color tags as literal elements in `Layout`'s `<head>`, one
> per `prefers-color-scheme`, beside the existing blocking theme script.

**Explicitly out of scope: the service worker.** Offline logging means queueing
writes that need server-assigned ids, replaying them against a
`(userId, date)` unique constraint, and resolving conflicts — none of which
fits the plain-form, full-revalidation model the whole app is built on.
Installability is worth having on its own; offline is a separate design
conversation. E2E just asserts the manifest and icons return 200 from the real
`preview` build.

---

## 05 · Duplicate a workout or a plan

`no migration` · `reuses copyForImport` · `route pattern change`

The natural way to build "Push A" from "Push B" is to copy one and edit it. The
machinery already exists for share-link imports and needs almost nothing to
serve this.

**Services.** `WorkoutService.duplicate` and `PlanService.duplicate`, both over
the aggregates' existing `copyForImport`. Its semantics are already exactly
right: a new row, `forkedFromId` null, inactive, unshared. The one difference
from the import path is that `exerciseIdFor` / `workoutIdFor` is the identity
function.

**Naming.** Resolve `"<name> (copy)"`, `"(copy 2)"`… against `listNamesFor`. No
constraint forces this — `workouts_sample_name_unique` only binds samples — but
two rows with identical names is a bad list.

**UI.** A menu item on the list rows and the detail header. Not destructive, so
no `ConfirmDialog`.

> **Duplicating a sample is deliberately not a fork.** `copyForImport` leaves
> `forkedFromId` null, so duplicating a sample gives a plain personal row with
> no revert and no effect on whether the sample still shows in the list. That is
> the correct behaviour and it differs from _editing_ a sample, which forks. Say
> so in the method's docstring, since the two paths sit side by side.
>
> `plans.tsx` and `workouts.tsx` currently post no intent at all and call
> `validateForm` directly. A second mutation moves them onto
> `dispatch`/`handled` — and every `SubmitButton` on those pages then needs a
> `match` prop, or they all spin together.

---

# Phase 3 — derived

## 06 · Progressive overload suggestions

`no migration` · `pure domain` · `depends on 01`

Targets on `workout_exercises` are static numbers edited by hand, so a plan
never actually progresses. `estimatedOneRepMax` and `personalRecords` already
sit in `app/domain/progress/`; what's missing is the step from "here's your
history" to "try this next".

**Domain.** `app/domain/progress/progression.ts` — a pure function, no I/O,
testable as a dense table:

```ts
export type Suggestion = {
  kind: 'increase-weight' | 'increase-reps' | 'hold';
  target: SetTarget;
  because: string;
};

export function suggestNextTarget(
  current: SetTarget,
  recent: readonly { date: DateOnly; sets: readonly LoggedSet[] }[],
  exerciseType: ExerciseType,
): Suggestion | null;
```

**The rule.** Double progression, which is the right model for
fixed-resistance equipment: met or beat `sets × reps` at the current weight on
the last two sessions → raise the weight one increment and reset reps to the
bottom of the range. Met the sets but not the reps → add a rep. Otherwise hold.
Cardio suggests +1 minute or +0.5 km/h, whichever the exercise's `cardioFields`
admits.

**Service.** `WorkoutService.suggestions(athlete, workoutId)`, reading through
the batched last-sets query 01 adds — widened there from "last set" to "last
_N_ sessions" rather than adding a third query over the same rows.

**Route.** An `applySuggestion` intent on `workouts.$workoutId.tsx` calling the
existing `updateExerciseTarget` — so it runs through `ForkableEditor` and forks
a sample correctly for free. Renders as a line under the target chips:
_"Suggested: 3 × 8 at 45 lb — you hit 3 × 10 twice"_ with an Apply.

> **Two things this must not do.**
>
> **Never apply automatically.** A silent rewrite of a plan someone is mid-cycle
> on is the app arguing with the athlete. The suggestion is a proposal with a
> visible reason; applying it is a tap.
>
> **Never suggest from one session.** Under two data points, return `null` — a
> single good day is noise, and a suggestion built on it teaches people to
> distrust the feature.
>
> Increment size is a fixed `Weight` constant per unit (5 lb / 2.5 kg), not a
> percentage: a PR1000's power rods come in discrete steps and 2.5% of anything
> is not a rod. An `exercises.weight_increment` column would do this properly
> later.

---

# Phase 4 — account and governance

## 07 · Data export and closing your own account

`new service` · `no migration` · `cascade risk — see top`

An administrator can delete any account; an athlete can't delete their own, and
nobody can get their data out. Two features sharing one new `?section=account`
panel in settings.

### Export

**Route.** `app/routes/settings.export.tsx` under `_protected` — loader only,
no default export, in the shape `exercises.$exerciseId.history.tsx` already
establishes. Returns a `Response` with `Content-Disposition: attachment`. Two
formats behind `?format=`: a complete JSON snapshot, and CSV of logged sets,
which is what actually gets opened in a spreadsheet.

**Service.** A new `ExportService` — it spans sessions, workouts, plans,
exercises and body weight, so it belongs to none of the existing ones. Register
it in all four places: the `contexts` map in `nest-bridge.server.ts`, the
destructured exports beside it, `services.module.ts`, and `singletons.ts`. The
compiler catches three of the four.

> **Two decisions to make on purpose.**
>
> **Export canonical units, not display units.** Pounds, km/h, seconds — with
> the unit in the column name (`weight_lb`) and the athlete's preference
> recorded in the JSON metadata. An export is data, not a rendering; converting
> it makes two exports of the same training incomparable because someone changed
> a setting in between.
>
> **`listRecent(userId, limit)` is the only session query, and an export must
> not be capped at 250 rows.** Add `listAll(userId)` to the port. Building the
> whole CSV in memory is fine here and only because the volume is bounded by one
> person's training history — worth stating in the code, since it is the kind of
> assumption that stops being true quietly.

### Self-deletion

**Domain.** _Not_ a reuse of `removeAccount` — that rule refuses acting on
_self_, which is the exact opposite. Add `closeOwnAccount` to
`domain/athlete/administration.ts`.

**Route.** A `deleteAccount` intent on `/settings?section=account`, gated
behind `ConfirmDialog` with typed-email confirmation, matching the
`DeleteAccountDto` shape `admin.users.$userId.tsx` already uses. Destroy the
session and redirect to `/`.

> **Self-deletion breaks an invariant that currently holds for free.**
> `administration.ts` guarantees the instance can never be left with no
> administrator, and it gets that guarantee structurally: an admin may only act
> on _someone else_, so whoever performed a change is still an admin afterwards.
>
> A sole administrator deleting themselves defeats that, and `/admin` becomes
> permanently unreachable — the first admin flag has to be granted with raw SQL.
> So `closeOwnAccount` has to refuse when the athlete is the last administrator,
> which means counting them: a rule about the whole set, exactly like
> `activatePlan`. It takes the count as a parameter and stays pure; the service
> supplies it.

---

## 08 · Admin audit trail

`migration` · `new port` · `2 adapters` · `contract test`

An administrator can grant admin, delete accounts, and read every athlete's
training. None of it is recorded. On an open-signup instance that is the one
security gap with no compensating control.

**Schema.** `admin_actions`: `id`, `actor_id`, `actor_email text not null`,
`target_id`, `target_email text not null`, `action text not null`,
`created_at`.

**Port.** `AdminActionsRepository` with `record` and `listRecent` —
append-only, no update or delete path. New symbol in
`app/repositories/tokens.ts`, binding in `repositories.module.ts`, both
adapters, contract suite.

**Service.** `AdminService.changeAdminAccess` and `removeAccount` write the
entry **inside the same `UnitOfWork.run`** as the mutation, so a failed delete
leaves no entry and a successful one always has one. `AdminService` does not
inject `UNIT_OF_WORK` today and will need to.

**UI.** A recent-actions card on `/admin`; optionally a full `/admin/audit`
page.

> **The foreign keys are the whole design.** `actor_id` is
> `on delete set null`, never cascade, and the email is denormalised alongside
> it. Deleting an account must not erase the record of who deleted it — under a
> cascade, an administrator could delete a user and then delete themselves and
> leave no trace of either. Same reasoning for `target_id`: the row it named is
> exactly the row that no longer exists.
>
> Two boundaries to state rather than leave implicit: **reads are not logged** —
> an admin viewing an account records nothing — and **retention is unbounded**,
> which is fine at this scale but should be a written decision, not an
> oversight.

---

# Phase 5 — expansion

## 09 · Body measurements beyond weight

`migration` · `new port` · `value object` · `folder rename`

`body_weight_logs` is a good pattern that generalises: waist, chest, arms,
thighs. The charts infrastructure takes it unchanged, because a measurement
series is the same `ProgressSeriesView` shape with a different unit.

**Schema.** A _separate_ `body_measurements` table — `(user_id, date, metric,
value)`, unique on all three — leaving `body_weight_logs` alone. `metric` is a
Postgres enum, not free text: `waist`, `chest`, `arm_left`, `arm_right`,
`thigh`, `hips`, `neck`. Free text lets two rows differ by whitespace and
quietly become two series.

**Domain.** `app/domain/values/length.ts` mirroring `Weight`'s shape exactly —
centimetres canonical, inches for display. Rename `app/domain/bodyweight/` to
`app/domain/body/` and hold both aggregates: mechanical, and the alternative
leaves a misleading folder name forever.

**Preferences.** A new `users.length_unit`. Not a reuse of `distanceUnit`,
which is km/mi for treadmill speed — a waist measured in miles is nonsense.
Seed it in the migration from the existing preference (`km → cm`, `mi → in`) so
nobody has to set it.

**UI.** `/weight` becomes `/body` with tabs, reusing
`exercise-progress-chart.tsx` untouched. Add the old path to
`legacy-redirect.tsx`'s map, which already exists for exactly this.

> **Why not one table.** Folding body weight into the same table would put a
> `Weight`-or-`Length` union in one `numeric` column and force every reader to
> branch on `metric` before it knows what the number means. Body weight also has
> its own service, repository, route and chart, all of which work. Two tables,
> one shared chart.

---

# The checklist this architecture imposes

Each of these is a place the codebase will let you forget something. Most are
caught by the compiler; the marked ones are not.

- Schema change → `npm run db:generate`, then _both_ adapters, then a case in
  `app/repositories/contract/`. CI applies migrations on merge to `main`.
- New port → symbol in `repositories/tokens.ts`, binding in
  `repositories.module.ts`, and a registration in `in-memory/references.ts` if
  another table points at it.
- **Not compiler-checked:** a new service must be named in four places — the
  `contexts` map, the destructured exports beside it, `services.module.ts`, and
  `singletons.ts`. Only the export can be got wrong silently.
- Every `@Injectable()` constructor parameter needs an explicit
  `@Inject(TOKEN)`. Neither `tsx` nor Rolldown emits `design:paramtypes`, so a
  miss fails at DI resolution, not at typecheck.
- New route → `app/routes.ts` and a `handle.crumb`, unless it is a resource
  route that is never itself the current page.
- One `class-validator` DTO per intent, through `dispatch`/`handled`. An
  undeclared intent is a 400, not a silent success.
- More than one form on a page → `SubmitButton match={intent.match}`
  everywhere, or every button spins at once.
- Destructive action → `ConfirmDialog`, with the confirm button reaching its
  form by `form="<id>"` since the dialog portals to `document.body`.
- Units convert at the edges only: `Weight.in(unit, n)` inbound,
  `AthletePreferences.format*` outbound. Nothing above the domain sees a bare
  numeric string.
- Services return plain DTOs. Loader data is serialised — anything with methods
  cannot cross.
- **Not compiler-checked:** `LibraryVisibility.selectFrom` and
  `drizzle/shared/visibility.ts` state the same rule twice. Tests are the only
  thing keeping them in step.
- `npm run format:write` on every file touched — there is no lint tooling and
  no CI formatting check.
- Then `typecheck`, `test`, `test:e2e`, and `test:contract` against a real
  Postgres for anything that changed the schema.
