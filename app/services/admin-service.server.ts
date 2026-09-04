import { Inject, Injectable } from '@nestjs/common';

import { changeAdminAccess, removeAccount, type AdminRefusal } from '~/domain/athlete/administration';
import type { Athlete } from '~/domain/athlete/athlete';
import { err, ok, type Result } from '~/domain/shared/result';
import { DateOnly } from '~/domain/values/date-only';
import type { DistanceUnit, WeightUnit } from '~/domain/values/units';
import type { AthletesRepository } from '~/repositories/athletes-repository.server';
import { ATHLETES_REPOSITORY, WORKOUT_SESSIONS_REPOSITORY } from '~/repositories/tokens';
import type { TrainingTotals, WorkoutSessionsRepository } from '~/repositories/workout-sessions-repository.server';
import { DOMAIN_DEPS } from '~/services/shared/tokens';

import type { DomainDeps } from './shared/deps.server';

/** One row of the user manager. */
export type AdminAccountView = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  /** Marks the administrator doing the looking, whose account they may not act on. */
  isSelf: boolean;
  joinedOn: string;
  lastActiveOn: string | null;
  workoutCount: number;
  setCount: number;
};

/** One account in full, as /admin/users/:userId shows it. */
export type AdminAccountDetailView = AdminAccountView & {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  showSampleData: boolean;
};

export type InstanceOverview = {
  totalAccounts: number;
  administrators: number;
  joinedRecently: number;
  activeRecently: number;
  totalWorkouts: number;
  totalSets: number;
  /** How many days "recently" spans, so the dashboard can label its own numbers. */
  recentWindowDays: number;
  newestAccounts: AdminAccountView[];
  busiestAccounts: AdminAccountView[];
};

export type AdminMutation = Result<{ name: string }, 'not-found' | AdminRefusal>;

/** What "new" and "active" mean on the dashboard. */
const RECENT_WINDOW_DAYS = 30;
const DASHBOARD_LIST_SIZE = 5;

const NO_TRAINING: TrainingTotals = { workoutCount: 0, setCount: 0, lastActiveOn: null };

/**
 * Use cases for the /admin area: what the instance as a whole looks like,
 * and acting on another athlete's account.
 *
 * Every method here reads or writes across *all* athletes, which nothing
 * else in the app does. `requireAdminMiddleware` on the `_admin` layout is
 * the gate; the `actor` each method takes is not a second gate but the
 * subject of the domain rules in `domain/athlete/administration.ts`, which
 * decide what an administrator may do to whom.
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(ATHLETES_REPOSITORY) private readonly athletes: AthletesRepository,
    @Inject(WORKOUT_SESSIONS_REPOSITORY) private readonly sessions: WorkoutSessionsRepository,
    @Inject(DOMAIN_DEPS) private readonly deps: DomainDeps,
  ) {}

  /** Instance-wide numbers, plus the two shortlists the dashboard leads with. */
  async overview(actor: Athlete): Promise<InstanceOverview> {
    const accounts = await this.accounts(actor);
    const since = DateOnly.today(this.deps.clock.now()).minusDays(RECENT_WINDOW_DAYS).value;

    return {
      totalAccounts: accounts.length,
      administrators: accounts.filter((account) => account.isAdmin).length,
      joinedRecently: accounts.filter((account) => account.joinedOn >= since).length,
      activeRecently: accounts.filter((account) => account.lastActiveOn !== null && account.lastActiveOn >= since).length,
      totalWorkouts: sum(accounts, (account) => account.workoutCount),
      totalSets: sum(accounts, (account) => account.setCount),
      recentWindowDays: RECENT_WINDOW_DAYS,
      newestAccounts: [...accounts].reverse().slice(0, DASHBOARD_LIST_SIZE),
      busiestAccounts: [...accounts]
        .sort((a, b) => b.setCount - a.setCount)
        .filter((account) => account.setCount > 0)
        .slice(0, DASHBOARD_LIST_SIZE),
    };
  }

  /** Every account, oldest first, each with its training totals folded in. */
  async accounts(actor: Athlete): Promise<AdminAccountView[]> {
    const [athletes, totals] = await Promise.all([this.athletes.listAll(), this.sessions.trainingTotals()]);
    return athletes.map((athlete) => toView(athlete, totals.get(athlete.id) ?? NO_TRAINING, actor));
  }

  async account(actor: Athlete, userId: string): Promise<AdminAccountDetailView | null> {
    const athlete = await this.athletes.findById(userId);
    if (!athlete) return null;

    const totals = await this.sessions.trainingTotals();
    return {
      ...toView(athlete, totals.get(athlete.id) ?? NO_TRAINING, actor),
      weightUnit: athlete.preferences.weightUnit,
      distanceUnit: athlete.preferences.distanceUnit,
      showSampleData: athlete.preferences.showSampleData,
    };
  }

  async changeAdminAccess(actor: Athlete, userId: string, isAdmin: boolean): Promise<AdminMutation> {
    const target = await this.athletes.findById(userId);
    if (!target) return err('not-found');

    const outcome = changeAdminAccess(actor, target, isAdmin, this.deps.clock.now());
    if (!outcome.ok) return outcome;

    await this.athletes.save(target);
    return ok({ name: target.name });
  }

  async removeAccount(actor: Athlete, userId: string): Promise<AdminMutation> {
    const target = await this.athletes.findById(userId);
    if (!target) return err('not-found');

    const outcome = removeAccount(actor, target);
    if (!outcome.ok) return outcome;

    await this.athletes.remove(target);
    return ok({ name: target.name });
  }
}

function sum<T>(items: T[], of: (item: T) => number): number {
  return items.reduce((running, item) => running + of(item), 0);
}

function toView(athlete: Athlete, totals: TrainingTotals, actor: Athlete): AdminAccountView {
  return {
    id: athlete.id,
    name: athlete.name,
    email: athlete.email,
    avatarUrl: athlete.avatarUrl,
    isAdmin: athlete.isAdmin,
    isSelf: athlete.id === actor.id,
    // A `YYYY-MM-DD` string, not the timestamp: loaders serialize, and every
    // date the UI formats crosses that boundary in this shape.
    joinedOn: DateOnly.today(athlete.createdAt).value,
    lastActiveOn: totals.lastActiveOn?.value ?? null,
    workoutCount: totals.workoutCount,
    setCount: totals.setCount,
  };
}
