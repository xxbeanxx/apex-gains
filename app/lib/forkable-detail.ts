import { data, redirect } from 'react-router';

import { Expose, Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { type Intent, intent } from '~/lib/intent';
import { trim } from '~/lib/validate-form';

class RenameDto {
  @Expose()
  @Transform(trim())
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  readonly name!: string;
}

/**
 * The four intents every fork-on-write detail page offers, under the same
 * names on each: a page spreads them into its own `intents` beside what it
 * alone does.
 */
export type ForkableIntents = {
  readonly delete: Intent<void>;
  readonly revert: Intent<void>;
  readonly duplicate: Intent<void>;
  readonly rename: Intent<RenameDto>;
};

/**
 * A fork-on-write detail page - a plan's, a workout's - declared once.
 *
 * Both pages offer the same four actions and map the same outcomes onto
 * HTTP, and the mapping is the part that is easy to get subtly wrong: a fork
 * that isn't redirected to looks to the athlete like their edit was lost,
 * because they are left staring at the untouched sample. The handlers for
 * `intents` are `forkableHandlers` in `./forkable-detail.server.ts`, and the
 * header that submits them is `ForkableActions`; what a page's *own* intents
 * do - reanchoring a plan, targeting a workout's exercise - is not in here.
 *
 * Client-safe on purpose, like `./intent.ts`: a route declares its page at
 * module scope, so the browser bundle reaches this file too.
 */
export type ForkableDetail = {
  /**
   * Capitalised, as a message says it: "Plan not found".
   */
  readonly noun: string;
  /**
   * Where a deletion lands.
   */
  readonly indexPath: string;
  /**
   * Where one row lives, for following a fork, a revert or a duplicate.
   */
  pathFor(id: string): string;

  readonly intents: ForkableIntents;

  /**
   * A row the athlete cannot see is a 404, in a loader or mid-action.
   */
  notFound(): never;

  /**
   * The epilogue every mutating intent shares: a row that isn't there is a
   * 404, and an edit that forked a sample has landed on a new row whose URL
   * the browser needs to follow.
   */
  settle(outcome: { ok: true; value: { forkedId: string | null } } | { ok: false }): { ok: true };
};

export function forkableDetail(page: { noun: string; indexPath: string; pathFor: (id: string) => string }): ForkableDetail {
  function notFound(): never {
    throw data(`${page.noun} not found`, { status: 404 });
  }

  return {
    noun: page.noun,
    indexPath: page.indexPath,
    pathFor: page.pathFor,

    intents: {
      delete: intent('delete'),
      revert: intent('revert'),
      duplicate: intent('duplicate'),
      rename: intent('rename', RenameDto, { invalidMessage: 'Invalid name' }),
    },

    notFound,

    settle(outcome) {
      if (!outcome.ok) notFound();
      if (outcome.value.forkedId) throw redirect(page.pathFor(outcome.value.forkedId));
      return { ok: true };
    },
  };
}
