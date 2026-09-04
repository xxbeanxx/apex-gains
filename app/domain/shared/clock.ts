/**
 * Aggregates stamp their own `createdAt` / `updatedAt`, so time is a port
 * they're handed rather than something they read from the environment.
 * Tests can then assert on timestamps without freezing global state.
 */

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function fixedClock(at: Date | string): Clock {
  const instant = typeof at === 'string' ? new Date(at) : at;
  return { now: () => new Date(instant) };
}
