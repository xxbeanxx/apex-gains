# Hexagonal Architecture Refactor Plan

## Goal and scope

Refactor the application to a true hexagonal architecture while preserving
current external behaviour, routes, database schema, deployment model, and
Nest-to-React-Router SSR handoff.

Nest remains the runtime and dependency-injection composition root. React
Router remains the web/UI adapter. Neither framework owns the domain model or
application use cases.

This plan assumes Nest controllers will not be introduced as a second HTTP API
adapter in this refactor. That is a separate design decision because it changes
the use-case and authentication contracts.

## Target architecture

```text
app/                         React Router inbound adapter + UI
  routes/                    HTTP/request -> application call -> HTTP response
  components/
  router/                    Router context, auth/session middleware, route helpers

src/
  domain/                    Pure business model and rules
  application/               Use cases, ports, DTOs/read models
    ports/                    Repository, transaction, identity, clock/ID ports
    use-cases/
  infrastructure/            Concrete outbound adapters
    persistence/drizzle/
    persistence/in-memory/
    identity/google/
    observability/
  shared/                    Framework-neutral utilities only

server/                      Nest composition root and runtime
  config/
  modules/
  providers/
  react-router/
  main.ts
```

Dependencies point inward:

```text
domain <- application <- { app (React Router), infrastructure, server (Nest) }
                       infrastructure <- server
```

`app/` and `server/` may depend on `src/application` and `src/domain`.
`src/domain` and `src/application` must never import Nest, React Router,
Drizzle, Express, environment variables, or concrete infrastructure.

## 1. Establish guardrails before moving code

1. Record a green baseline with:
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - the relevant Playwright suite when its dependencies are available.
2. Add an architecture dependency check and run it in CI and locally. It must
   reject these imports:
   - `src/domain/**` importing anything outside `src/domain/**` other than the
     TypeScript standard library;
   - `src/application/**` importing `@nestjs/*`, `react-router`,
     `@react-router/*`, `drizzle-*`, `postgres`, `openid-client`, `express`,
     `vite`, `node:*`, `app/**`, or `server/**`;
   - `src/infrastructure/**` importing `app/**` or `server/**`.
3. Use a dependency-boundary tool or a small checked-in verification script;
   convention alone is not sufficient.

## 2. Add aliases and migrate in vertical slices

Update `tsconfig.json` and Vite resolution with explicit aliases:

- `~domain/*` -> `src/domain/*`
- `~application/*` -> `src/application/*`
- `~infrastructure/*` -> `src/infrastructure/*`
- `~app/*` -> `app/*`
- retain `~server/*` -> `server/*`

Do not move React Router's `app/` directory. Keeping it preserves framework
conventions, route type generation, and the SSR build shape. Migrate one
bounded context at a time and run typecheck/tests after every slice.

## 3. Make `src/domain` strictly pure

Move `app/domain/**` to `src/domain/**`.

Requirements:

- no decorators;
- no Nest, React Router, Drizzle, repository, logging, configuration,
  environment, request, or response imports;
- retain aggregates, value objects, policies, validation rules, and domain
  errors;
- retain injected clock, ID-generator, and secret-generator abstractions.

Update imports from `~/domain/...` to `~domain/...`. The domain must compile
and test without Nest, React Router, or a database.

## 4. Extract a framework-free application layer

Move `app/services/**` to `src/application/use-cases/**`; remove the `.server`
suffix where it no longer adds useful information.

For every current service:

- remove `@Injectable()`, `@Inject(...)`, and all `@nestjs/common` imports;
- retain explicit constructors typed against interfaces/ports;
- retain orchestration, transaction boundaries, business authorization, and
  read-model mapping;
- prohibit `Request`, `Response`, redirects, cookies, and React Router
  `data()` calls.

`PlanService`, `WorkoutService`, `SessionService`, and the other current
services become application use-case services. Their summaries, detail views,
and other read models remain application DTOs, because multiple adapters may
need them.

## 5. Define application ports

Move repository interfaces from `app/repositories/*.server.ts` to
`src/application/ports/persistence/**`.

Define or formalize ports for every non-domain dependency:

- repositories and unit of work;
- time, identifiers, and secrets;
- identity/OIDC;
- logging only where application code genuinely needs it;
- future file/export or external integrations.

Ports use application/domain types and primitive values only. They must not
expose `openid-client` configuration/claims objects or other library-specific
types.

Application classes receive ports directly. Remove Nest injection usage from
application code. Any Nest-only tokens live under `server/providers/` rather
than alongside the application ports.

## 6. Move concrete adapters to infrastructure

Relocate concrete implementations as follows:

| Current location                                               | Target                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `app/db/schema.ts`, `index.server.ts`, `transaction.server.ts` | `src/infrastructure/persistence/drizzle/`                                 |
| `app/repositories/drizzle/**`                                  | `src/infrastructure/persistence/drizzle/repositories/`                    |
| `app/repositories/in-memory/**`                                | `src/infrastructure/persistence/in-memory/`                               |
| `app/repositories/shared/**`                                   | `src/infrastructure/persistence/shared/`, unless purely application logic |
| `server/auth/oidc-client.provider.ts`                          | `src/infrastructure/identity/google/` plus a Nest registration wrapper    |
| concrete logging implementation                                | `src/infrastructure/observability/`, if it implements an application port |

Drizzle and in-memory implementations must both implement the same application
ports. Keep in-memory adapters accessible to unit and contract tests. Update
`drizzle.config.ts`, `db:seed`, and all contract-test paths. Move repository
contract tests to `test/contracts/persistence/` so the presentation adapter
does not own persistence verification.

## 7. Make Nest only the composition root

Refactor `server/services/services.module.ts` and
`server/repositories/repositories.module.ts` so Nest registers application
use cases through explicit factories.

Each factory injects concrete adapters and constructs a pure application class:

```ts
{
  provide: PlanService,
  inject: [PLANS_REPOSITORY, WORKOUTS_REPOSITORY, UNIT_OF_WORK, DOMAIN_DEPS],
  useFactory: (plans, workouts, unitOfWork, deps) =>
    new PlanService(plans, workouts, unitOfWork, deps),
}
```

Keep adapter selection (Drizzle versus in-memory), configuration validation,
provider tokens, Express configuration, and process lifecycle management in
`server/`.

## 8. Thin the React Router adapter

Keep routes, components, and React Router middleware in `app/`. Their allowed
responsibilities are:

1. parse request URL, form data, and cookies;
2. perform route-level authentication/authorization redirects;
3. validate and normalize transport input;
4. call an application use case;
5. translate results/errors to loader data, `Response`, redirects, or UI.

Move only framework-neutral helpers from `app/lib` into application/shared
code. Keep HTTP and React Router helpers--such as intents, redirects, request
logging middleware, form handling, and route auth middleware--in `app/`.
Routes must not import Drizzle, concrete repositories, Nest, or external SDKs.

## 9. Make authentication hexagonal

The Google OAuth routes currently coordinate SDK use, user provisioning,
cookies, and logging. Replace that direct SDK access with:

1. an application identity port such as `GoogleIdentityProvider`;
2. a `BeginGoogleLogin` use case returning primitives only: authorization URL,
   PKCE verifier, nonce, state, and validated redirect target;
3. a `CompleteGoogleLogin` use case accepting primitive callback data and
   returning a normalized profile or typed failure;
4. a Google/openid-client adapter under `src/infrastructure/identity/google`;
5. React Router routes that derive the public redirect URI, serialize/parse
   the temporary cookie, invoke use cases, write/destroy session cookies, and
   redirect.

Cookie/session mechanics remain in the React Router adapter because they are
HTTP transport concerns. The bridge-facing types must no longer expose
`ConfigType`, `LoggerService`, or `openid-client` types.

## 10. Retain, but narrow, the Nest-to-React-Router bridge

Keep the existing split because it is required by separate development and
production module graphs:

- `server/main.ts` bootstraps Nest and extracts composed values;
- `server/react-router/handler.ts` creates `RouterContextProvider` in the
  React Router module graph;
- rename `app/lib/nest-bridge.server.ts` to
  `app/router/load-context.server.ts` (or equivalent).

Expose only these categories through the context map:

- application use cases;
- React Router transport adapters such as session storage;
- small framework-neutral interfaces such as `AppLogger`;
- plain feature-flag/config DTOs.

The bridge must remain reachable from the React Router build. Do not move it
into `server/`, because React Router requires its own `RouterContextProvider`
and context-token identities.

## 11. Clarify test ownership

Organize tests by layer:

- domain tests beside `src/domain`;
- application/use-case tests beside `src/application`, manually constructed
  with test doubles or in-memory adapters;
- persistence adapter contract tests under `test/contracts`;
- Nest composition tests under `server/**/*.test.ts`;
- React Router route/middleware tests under `app/**/*.test.ts`;
- browser behavior under `e2e/`.

Add tests proving that:

- application use cases import no Nest or React Router code;
- both Drizzle and in-memory adapters satisfy the same use cases;
- Google identity failures become typed application outcomes;
- route tests verify transport behavior without duplicating domain-rule tests;
- the current load-context identity behavior works in development and
  production builds.

## 12. Completion criteria

The refactor is complete only when:

- `src/domain` has no framework, I/O, or infrastructure imports;
- `src/application` has no Nest, React Router, database, SDK, environment, or
  Node runtime imports;
- no application service has Nest decorators;
- Nest constructs application services through explicit factories;
- React Router contains no direct `openid-client`, database, or repository
  adapter usage;
- `server/` contains composition/runtime code, not domain rules or use-case
  implementations;
- `npm run typecheck`, `npm test`, `npm run build`, contract tests, and E2E
  tests pass;
- development and production SSR both prove the Nest-to-React-Router
  load-context bridge still works.
