import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

type Constructor<T> = new () => T;

export type FormValidation<T> = { success: true; data: T } | { success: false; message: string };

function firstMessage(errors: ValidationError[]): string {
  const constraints = errors[0]?.constraints;
  return constraints ? Object.values(constraints)[0]! : 'Invalid input';
}

/**
 * Validates and transforms a plain object (typically `Object.fromEntries(formData)`)
 * into an instance of the given class-validator DTO. Unlike `validateConfigSlice`
 * (which throws, appropriate for a boot-time failure), a bad form submission is
 * expected traffic, so this returns a result the caller turns into a 400.
 *
 * The decorators a DTO is declared with live in `validate-form.ts` instead,
 * which has no `.server` suffix - see the note there.
 */
export function validateForm<T extends object>(schema: Constructor<T>, source: Record<string, unknown>): FormValidation<T> {
  const instance = plainToInstance(schema, source, { excludeExtraneousValues: true });

  const errors = validateSync(instance, { whitelist: true, forbidUnknownValues: false });

  if (errors.length > 0) {
    return { success: false, message: firstMessage(errors) };
  }

  return { success: true, data: instance };
}
