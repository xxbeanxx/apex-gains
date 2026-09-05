import { systemClock, type Clock } from '~/domain/shared/clock';
import { randomIds, type IdGenerator } from '~/domain/shared/ids';
import { randomSecrets, type SecretGenerator } from '~/domain/shared/secrets';

/**
 * The capabilities aggregates need but must not reach for themselves: fresh
 * identifiers, the current time, and unguessable tokens. Keeping them as
 * arguments is what lets the whole domain layer be tested without stubbing
 * globals.
 */
export type DomainDeps = {
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly secrets: SecretGenerator;
};

export const productionDeps: DomainDeps = {
  ids: randomIds,
  clock: systemClock,
  secrets: randomSecrets,
};
