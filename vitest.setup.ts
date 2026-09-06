// Nest's decorators (`@Module()`, `@Inject()`) call `Reflect.defineMetadata`
// at class-definition time (module evaluation), which only exists once this
// polyfill has run. `server/main.ts` imports it before bootstrapping; vitest
// never goes through that bootstrap, so a test that reaches a decorated class
// under `server/` needs it loaded here instead.
import 'reflect-metadata';
