// @nestjs/common's `@Injectable()`/`@Inject()` decorators call
// `Reflect.defineMetadata` at class-definition time (module evaluation),
// which only exists once this polyfill has run - unlike `server/main.ts`,
// vitest never goes through Nest's bootstrap, so nothing else imports it.
// Every `app/services/*.server.ts` file is decorated, so this has to load
// before any test file that (transitively) imports one.
import 'reflect-metadata';
