import { plainToInstance, type TransformFnParams } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

/** Coerces an incoming environment variable string to a boolean. */
export function toBoolean(): (params: TransformFnParams) => boolean {
  return ({ value }: TransformFnParams) => {
    return String(value).toLowerCase() === 'true';
  };
}

/** Coerces an incoming environment variable string to a number. */
export function toNumber(): (params: TransformFnParams) => number {
  return ({ value }: TransformFnParams) => {
    return Number(value);
  };
}

type Constructor<T> = new () => T;

function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .map((error) => {
      const constraints = error.constraints ? Object.values(error.constraints).join(', ') : 'invalid value';
      return `${error.property}: ${constraints}`;
    })
    .join('; ');
}

/**
 * Validates and transforms a flat source (typically `process.env`) into an
 * instance of the given class-validator schema. Throws a single formatted
 * error listing every invalid or missing variable, rather than failing on
 * the first one.
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
    throw new Error(`Invalid environment variables: ${formatValidationErrors(errors)}`);
  }

  return instance;
}
