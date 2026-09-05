import { data, redirect } from 'react-router';

import type { Intent } from './intent';
import type { IntentResponse } from './intent.server';

/**
 * What a fork-on-write detail page - a routine's, a template's - answers
 * with.
 *
 * Both pages map the same four outcomes onto HTTP, and the mapping is the
 * part that is easy to get subtly wrong: a fork that isn't redirected to
 * looks to the athlete like their edit was lost, because they are left
 * staring at the untouched sample. Stating it once is what keeps a third
 * such page from having to rediscover that.
 *
 * What the page's *own* intents do is not in here - reanchoring a routine
 * and adding an exercise to a template have nothing in common.
 */
export type ForkableDetail = {
  /** A row the athlete cannot see is a 404, in a loader or mid-action. */
  notFound(): never;

  /**
   * The epilogue every mutating intent shares: a row that isn't there is a
   * 404, and an edit that forked a sample has landed on a new row whose URL
   * the browser needs to follow.
   */
  settle(outcome: { ok: true; value: { forkedId: string | null } } | { ok: false }): { ok: true };

  /**
   * Deleting: gone means back to the index; a sample refuses, because it is
   * shared with everyone and hiding it is what the sample-data preference is
   * for.
   */
  deleted(
    intent: Intent<void>,
    outcome: { ok: true } | { ok: false; error: 'not-found' | 'sample' },
    onDeleted?: () => void,
  ): IntentResponse;

  /**
   * Reverting: the copy is discarded and the browser follows the sample,
   * which reappears in the athlete's list now that nothing forks from it.
   */
  reverted(
    intent: Intent<void>,
    outcome: { ok: true; value: { forkedFromId: string } } | { ok: false; error: 'not-found' | 'nothing-to-revert' },
  ): IntentResponse;
};

export function forkableDetail(page: {
  /** Capitalised, as a message says it: "Routine not found". */
  noun: string;
  /** Where a deletion lands. */
  indexPath: string;
  /** Where one row lives, for following a fork or a revert. */
  pathFor: (id: string) => string;
}): ForkableDetail {
  function notFound(): never {
    throw data(`${page.noun} not found`, { status: 404 });
  }

  return {
    notFound,

    settle(outcome) {
      if (!outcome.ok) notFound();
      if (outcome.value.forkedId) throw redirect(page.pathFor(outcome.value.forkedId));
      return { ok: true };
    },

    deleted(intent, outcome, onDeleted) {
      if (!outcome.ok) {
        if (outcome.error === 'not-found') notFound();
        return intent.reject(`Sample ${page.noun.toLowerCase()}s can't be deleted.`);
      }
      onDeleted?.();
      throw redirect(page.indexPath);
    },

    reverted(intent, outcome) {
      if (!outcome.ok) {
        if (outcome.error === 'not-found') notFound();
        return intent.reject('Nothing to revert');
      }
      throw redirect(page.pathFor(outcome.value.forkedFromId));
    },
  };
}
