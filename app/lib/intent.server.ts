import { type Intent, intent } from './intent.js';
import { validateForm } from './validate-form.server.js';

/**
 * Running the intents a page declares - the server half of `./intent.ts`.
 *
 * One `dispatch` replaces the epilogue every `action` used to repeat: read
 * the form, match the intent, validate its DTO, turn a bad submission into a
 * tagged 400, and refuse an intent the page never declared. What is left in
 * a route is the part that is actually about that route - the service call,
 * and what its failures mean.
 */

/** The 400 an intent returns when its own submission doesn't validate. */
export type IntentResponse = ReturnType<Intent<never>['reject']>;

/**
 * One declared intent bound to what it does. `handled` builds these; the
 * union of every handler's return type is what a route's `actionData`
 * infers from, so a route keeps the types it had.
 */
export type HandledIntent<Result> = {
  readonly intent: Intent<never>;
  run(formData: FormData): Promise<Result | IntentResponse>;
};

/** Any bound intent, with its own result type erased. */
type AnyHandledIntent = { readonly intent: Intent<never>; run(formData: FormData): Promise<unknown> };

/**
 * What one handler answers with. Read off `run` rather than through a type
 * parameter, because inference from an array of `HandledIntent<Result>` picks
 * the first element's type instead of unioning them - and a route's
 * `actionData` has to name every branch's shape, not just the first.
 */
type ResultOf<H extends AnyHandledIntent> = Awaited<ReturnType<H['run']>>;

/**
 * Binds an intent to what it does. The handler receives its DTO already
 * validated, so a route branch never checks `result.success` again.
 *
 * Throwing is how a handler answers with a redirect or a 404, exactly as it
 * did before - `settle` and its neighbours still work unchanged.
 */
export function handled<T extends object, Result>(
  intent: Intent<T>,
  run: (input: T) => Promise<Result> | Result,
): HandledIntent<Result>;
export function handled<Result>(intent: Intent<void>, run: () => Promise<Result> | Result): HandledIntent<Result>;
export function handled<T extends object, Result>(
  intent: Intent<T> | Intent<void>,
  run: (input: T) => Promise<Result> | Result,
): HandledIntent<Result> {
  return {
    intent: intent as Intent<never>,
    async run(formData: FormData) {
      const { schema, options } = intent;
      if (!schema) return run(undefined as never);

      const source = options.fields ? options.fields(formData) : Object.fromEntries(formData);
      const result = validateForm(schema, source);
      if (!result.success) {
        return intent.reject(options.invalidMessage ?? result.message);
      }
      return run(result.data as T);
    },
  };
}

/**
 * Reads the submission once and runs whichever declared intent it names.
 *
 * An unrecognised intent is a 400 rather than a silent no-op: every form on
 * a page posts a name this list knows, so anything else is a stale tab or a
 * hand-rolled request, and answering "ok" would look to the browser like the
 * mutation happened.
 */
/** Names an intent the page never declared, only so the 400 can be tagged with it. */
function unknownIntent(name: string): Intent<void> {
  return intent(name);
}

export async function dispatch<Handlers extends readonly AnyHandledIntent[]>(
  request: Request,
  handlers: Handlers,
): Promise<ResultOf<Handlers[number]> | IntentResponse> {
  const formData = await request.formData();
  const name = formData.get('intent');

  const handler = handlers.find((candidate) => candidate.intent.name === name);
  if (!handler) return unknownIntent(typeof name === 'string' ? name : 'unknown').reject('Unknown action');

  return handler.run(formData) as Promise<ResultOf<Handlers[number]>>;
}
