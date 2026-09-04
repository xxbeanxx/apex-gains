import type { TransformFnParams } from 'class-transformer';
import { plainToInstance } from 'class-transformer';
import {
  registerDecorator,
  validateSync,
  ValidationError,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { DateOnly } from '~/domain/values/date-only';

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
 */
export function validateForm<T extends object>(schema: Constructor<T>, source: Record<string, unknown>): FormValidation<T> {
  const instance = plainToInstance(schema, source, { excludeExtraneousValues: true });

  const errors = validateSync(instance, { whitelist: true, forbidUnknownValues: false });

  if (errors.length > 0) {
    return { success: false, message: firstMessage(errors) };
  }

  return { success: true, data: instance };
}

/** Trims a string form value; leaves other values untouched. */
export function trim(): (params: TransformFnParams) => unknown {
  return ({ value }: TransformFnParams) => (typeof value === 'string' ? value.trim() : value);
}

/** Trims a string form value and maps a blank result to `undefined`, for optional free-text fields. */
export function optionalTrim(): (params: TransformFnParams) => unknown {
  return ({ value }: TransformFnParams) => {
    const trimmed = typeof value === 'string' ? value.trim() : value;
    return trimmed ? trimmed : undefined;
  };
}

/** Coerces a form value to a number. */
export function toNumber(): (params: TransformFnParams) => unknown {
  return ({ value }: TransformFnParams) => Number(value);
}

/**
 * Coerces an optional numeric form value, mapping a blank field to `undefined`
 * rather than `Number('') === 0`.
 */
export function toOptionalNumber(): (params: TransformFnParams) => unknown {
  return ({ value }: TransformFnParams) => (value === '' || value === undefined || value === null ? undefined : Number(value));
}

@ValidatorConstraint({ name: 'isDateOnly' })
class IsDateOnlyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && DateOnly.isValid(value);
  }

  defaultMessage(): string {
    return 'must be a valid date';
  }
}

/** Validates a `YYYY-MM-DD` calendar-day string via `DateOnly.isValid`. */
export function IsDateOnly(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: IsDateOnlyConstraint,
    });
  };
}
