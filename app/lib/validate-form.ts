import type { TransformFnParams } from 'class-transformer';
import {
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';

import { DateOnly } from '~domain/values/date-only';
import { Rpe } from '~domain/values/rpe';

/**
 * The decorator and transform helpers a form DTO is *declared* with, as
 * opposed to `validate-form.server.ts`, which is what runs one.
 *
 * These cannot carry a `.server` suffix. Route modules declare their DTO
 * classes at module scope - decorators have to run when the class is
 * defined - so the client build reaches these helpers through the class
 * declaration, not through the `action` that React Router strips. A
 * server-only import there fails the build with "Server-only module
 * referenced by client".
 *
 * Nothing here validates anything by itself: applying a decorator only
 * records metadata, so this stays inert in the browser.
 */

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

@ValidatorConstraint({ name: 'isRpe' })
class IsRpeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'number' && Rpe.isValid(value);
  }

  defaultMessage(): string {
    return 'must be between 1 and 10, in half-point steps';
  }
}

/** Validates a rate-of-perceived-exertion rating via `Rpe.isValid`. */
export function IsRpe(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: IsRpeConstraint,
    });
  };
}
