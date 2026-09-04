import { registerAs, type ConfigType } from "@nestjs/config";
import { plainToInstance, type TransformFnParams } from "class-transformer";
import { validateSync, ValidationError } from "class-validator";

import { CoreConfig } from "./core.config";
import { DatabaseConfig } from "./database.config";
import { GoogleOAuthConfig } from "./google-oauth.config";
import { SessionConfig } from "./session.config";
import { TestLoginConfig } from "./test-login.config";

/**
 * Per-slice namespaced loaders (`registerAs`), so a module can request only
 * the piece of config it actually needs - e.g. `RepositoriesModule` only
 * ever injects `databaseConfig.KEY`, it has no reason to see session or
 * OAuth secrets.
 */
export const coreConfig = registerAs("coreConfig", () =>
  validateConfigSlice(CoreConfig, process.env),
);
export const databaseConfig = registerAs("databaseConfig", () =>
  validateConfigSlice(DatabaseConfig, process.env),
);
export const googleOAuthConfig = registerAs("googleOAuthConfig", () =>
  validateConfigSlice(GoogleOAuthConfig, process.env),
);
export const sessionConfig = registerAs("sessionConfig", () =>
  validateConfigSlice(SessionConfig, process.env),
);
export const testLoginConfig = registerAs("testLoginConfig", () =>
  validateConfigSlice(TestLoginConfig, process.env),
);

/**
 * Typed access to the merged `appConfig` namespace. This is the shape
 * exposed to the React Router app via load context (`appConfigContext`) -
 * see `server/react-router/contexts.ts`.
 */
export type AppConfig = Readonly<ConfigType<typeof appConfig>>;

/**
 * Merges every validated config slice into one namespace, registered under
 * `appConfig`. `ConfigModule.forRoot({ load: [appConfig] })` calls this
 * lazily, so by the time it runs every slice module below has finished
 * evaluating - see the comment on `toBoolean`/`toNumber` for why that
 * matters for the circular import between this file and the slice files.
 */
export const appConfig = registerAs("appConfig", () => {
  return {
    ...validateConfigSlice(CoreConfig, process.env),
    ...validateConfigSlice(DatabaseConfig, process.env),
    ...validateConfigSlice(GoogleOAuthConfig, process.env),
    ...validateConfigSlice(SessionConfig, process.env),
    ...validateConfigSlice(TestLoginConfig, process.env),
  };
});

/**
 * Transformation factory for class-transformer that coerces an incoming
 * environment variable string to boolean.
 *
 * Declared as a hoisted `function`, not a `const` arrow function: the slice
 * config files (`core.config.ts` etc.) import this back from here while
 * this file imports their schema classes, and a `function` declaration's
 * binding is live before any module in the cycle finishes evaluating - a
 * `const` wouldn't be.
 */
export function toBoolean(): (params: TransformFnParams) => boolean {
  return ({ value }: TransformFnParams) => {
    return String(value).toLowerCase() === "true";
  };
}

/**
 * Transformation factory that coerces an incoming environment variable
 * string to a number. See `toBoolean` for why this is a hoisted `function`.
 */
export function toNumber(): (params: TransformFnParams) => number {
  return ({ value }: TransformFnParams) => {
    return Number(value);
  };
}

type Constructor<T> = new () => T;

function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .map((error) => {
      const constraints = error.constraints
        ? Object.values(error.constraints).join(", ")
        : "invalid value";
      return `${error.property}: ${constraints}`;
    })
    .join("; ");
}

/**
 * Validates and transforms a flat source (typically `process.env`) into an
 * instance of the given class-validator schema. Throws a single formatted
 * error listing every invalid/missing var, rather than failing on the
 * first one - this is what replaces the old `requireEnv()` throws in
 * `app/auth/env.server.ts`.
 */
export function validateConfigSlice<TSchema extends object>(
  schema: Constructor<TSchema>,
  source: Record<string, unknown>,
): TSchema {
  const instance = plainToInstance(schema, source, {
    enableImplicitConversion: true,
    excludeExtraneousValues: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(instance, {
    skipMissingProperties: false,
    whitelist: true,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment variables: ${formatValidationErrors(errors)}`,
    );
  }

  return instance;
}
