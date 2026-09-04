import { systemClock, type Clock } from '~/domain/shared/clock';
import { randomIds, type IdGenerator } from '~/domain/shared/ids';

/**
 * The two capabilities aggregates need but must not reach for themselves:
 * fresh identifiers and the current time. Keeping them as arguments is what
 * lets the whole domain layer be tested without stubbing globals.
 */
export type DomainDeps = {
  readonly ids: IdGenerator;
  readonly clock: Clock;
};

export const productionDeps: DomainDeps = {
  ids: randomIds,
  clock: systemClock,
};
