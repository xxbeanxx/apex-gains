/**
 * A named mutation on a page, declared once.
 *
 * A page with several forms has to agree with itself about a string in five
 * places: the hidden field that names the intent, the branch in `action`
 * that matches it, the DTO that branch validates, the tag on the error it
 * returns, and the `match` that decides which submit button spins. Written
 * out by hand those are five independent chances to typo, and none of them
 * is a type error - a mismatch just silently stops working.
 *
 * `intent()` declares the name once and derives the rest. `dispatch` in
 * `./intent.server.ts` is the other half: it runs one.
 *
 * Deliberately has no `.server` suffix. Route modules declare their intents
 * at module scope, so the client build reaches this file through the
 * declaration rather than through the `action` React Router strips - a
 * server-only import here fails the build with "Server-only module
 * referenced by client".
 */

import { data } from 'react-router';

/** A form DTO class, as `validateForm` takes it. */
type Constructor<T> = new () => T;

export type IntentOptions = {
  /**
   * What to validate, when the whole submission isn't it. Used by a form
   * whose fields need adjusting first - an unchecked checkbox is absent from
   * a submission entirely, and that absence is how a browser spells "false".
   */
  readonly fields?: (formData: FormData) => Record<string, unknown>;
  /**
   * The 400 message for a submission that fails validation. Defaults to the
   * failing constraint's own message, which is usually what a person needs;
   * override it where the constraint's wording would leak field names.
   */
  readonly invalidMessage?: string;
};

/**
 * What `actionData` carries when an intent rejected a submission. Routes
 * return this shape today, and components read the tag back to decide which
 * form shows the message.
 */
export type IntentRejection = {
  readonly error: string;
  readonly intent: string;
};

export type Intent<T extends object | void = void> = {
  readonly name: string;
  readonly schema: Constructor<T & object> | undefined;
  readonly options: IntentOptions;

  /** Spread onto the hidden input that names this intent: `<input {...intent.field} />`. */
  readonly field: { readonly type: 'hidden'; readonly name: 'intent'; readonly value: string };

  /**
   * Passed to `SubmitButton`'s `match`, so a page with several plain forms
   * spins only the button that was actually pressed.
   */
  readonly match: { readonly intent: string };

  /**
   * A 400 tagged as this intent's, for a submission that validated but the
   * service refused. `errorIn` is what reads it back.
   */
  reject(message: string): ReturnType<typeof data<IntentRejection>>;

  /** This intent's rejection message out of `actionData`, if the last submission was its own. */
  errorIn(actionData: unknown): string | undefined;

  /** Whether `actionData` reports this intent succeeding. */
  succeededIn(actionData: unknown): boolean;
};

function isRejection(actionData: unknown, name: string): actionData is IntentRejection {
  return (
    typeof actionData === 'object' &&
    actionData !== null &&
    'error' in actionData &&
    'intent' in actionData &&
    actionData.intent === name
  );
}

export function intent(name: string, options?: IntentOptions): Intent<void>;
export function intent<T extends object>(name: string, schema: Constructor<T>, options?: IntentOptions): Intent<T>;
export function intent<T extends object>(
  name: string,
  schemaOrOptions?: Constructor<T> | IntentOptions,
  maybeOptions?: IntentOptions,
): Intent<T> {
  const schema = typeof schemaOrOptions === 'function' ? schemaOrOptions : undefined;
  const options = (typeof schemaOrOptions === 'function' ? maybeOptions : schemaOrOptions) ?? {};

  return {
    name,
    schema,
    options,
    field: { type: 'hidden', name: 'intent', value: name },
    match: { intent: name },
    reject: (message) => data({ error: message, intent: name }, { status: 400 }),
    errorIn: (actionData) => (isRejection(actionData, name) ? actionData.error : undefined),
    succeededIn: (actionData) =>
      typeof actionData === 'object' &&
      actionData !== null &&
      'ok' in actionData &&
      actionData.ok === true &&
      'intent' in actionData &&
      actionData.intent === name,
  };
}
