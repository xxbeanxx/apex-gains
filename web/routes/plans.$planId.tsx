import { Expose } from 'class-transformer';
import { IsIn, IsUUID, Validate, ValidatorConstraint, type ValidatorConstraintInterface, isUUID } from 'class-validator';
import { CalendarPlusIcon, MoonIcon, PlusIcon, PowerIcon, Share2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Form, Link, redirect, useSearchParams } from 'react-router';
import type { PlanSlotView } from '~application/use-cases/plan-service';
import type { WorkoutSummary } from '~application/use-cases/workout-service';
import { DateOnly } from '~domain/values/date-only';
import { formatRelativeDate } from '~shared/format';
import { requireAthlete } from '~web/auth/user-context';
import { BuilderFrame } from '~web/components/builder/builder-frame';
import { BuilderOutline, BuilderOutlineItem } from '~web/components/builder/builder-outline';
import { BuilderPalette, BuilderPaletteSearch } from '~web/components/builder/builder-palette';
import { BuilderRow } from '~web/components/builder/builder-row';
import { RenameDisclosure } from '~web/components/builder/rename-disclosure';
import { RowMoveButtons, RowRemoveMenu } from '~web/components/builder/row-controls';
import { CustomizedNote, ForkableActions, OwnershipBadge } from '~web/components/forkable-header';
import { Page, PageHeader, Section } from '~web/components/layout/page';
import { SharePlanDialog } from '~web/components/share-plan-dialog';
import { Badge } from '~web/components/ui/badge';
import { DateField } from '~web/components/ui/date-field';
import { EmptyState } from '~web/components/ui/empty-state';
import { SubmitButton } from '~web/components/ui/submit-button';
import { type ForkableDetail, forkableDetail } from '~web/lib/forkable-detail';
import { forkableHandlers } from '~web/lib/forkable-detail.server';
import { intent } from '~web/lib/intent';
import { dispatch, handled } from '~web/lib/intent.server';
import { requestLogger } from '~web/lib/logger';
import { encodeQr } from '~web/lib/qr.server';
import { shareUrlFor } from '~web/lib/share-link';
import { IsDateOnly } from '~web/lib/validate-form';
import { athleteCalendarContext, planServiceContext, workoutServiceContext } from '~web/router/load-context';

import type { Route } from './+types/plans.$planId';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.plan.name ?? 'Plan'} - Apex Gains` }];
}

export const handle = {
  crumb: (data: Awaited<ReturnType<typeof loader>>) => [{ label: 'Plans', to: '/plans' }, { label: data.plan.name }],
};

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const planService = context.get(planServiceContext);
  const plan = await planService.detail(athlete, params.planId);

  if (!plan) {
    page.notFound();
  }

  const workoutService = context.get(workoutServiceContext);

  // Encoded here rather than in the browser: the library stays out of the
  // client bundle, and the dialog has a scannable code on first paint.
  const shareUrl = plan.shareToken === null ? null : shareUrlFor(request, plan.shareToken);

  return {
    plan: plan,
    workouts: await workoutService.listForPicker(athlete),
    share: shareUrl === null ? null : { url: shareUrl, qr: encodeQr(shareUrl) },
    todayStr: context.get(athleteCalendarContext).today(athlete).value,
  };
}

class ReanchorPlanDto {
  @Expose()
  @IsDateOnly()
  readonly anchorDate!: string;
}

/**
 * A plan slot names either a workout by id, or the sentinel `'rest'` for a rest day.
 */
@ValidatorConstraint({ name: 'isWorkoutSlotId' })
class IsWorkoutSlotIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return value === 'rest' || (typeof value === 'string' && isUUID(value));
  }
}

class AddSlotDto {
  @Expose()
  @Validate(IsWorkoutSlotIdConstraint)
  readonly workoutId!: string;
}

class SlotIdDto {
  @Expose()
  @IsUUID()
  readonly slotId!: string;
}

class MoveSlotDto extends SlotIdDto {
  @Expose()
  @IsIn(['up', 'down'])
  readonly direction!: 'up' | 'down';
}

// Annotated so `notFound()`'s `never` narrows at the call site: TypeScript
// only applies that to a dotted name whose type is declared, not inferred.
const page: ForkableDetail = forkableDetail({ noun: 'Plan', indexPath: '/plans', pathFor: (id) => `/plans/${id}` });
const { settle } = page;

const intents = {
  ...page.intents,
  reanchor: intent('reanchor', ReanchorPlanDto, { invalidMessage: 'Invalid date' }),
  activate: intent('activate'),
  deactivate: intent('deactivate'),
  share: intent('share'),
  unshare: intent('unshare'),
  addSlot: intent('addSlot', AddSlotDto, { invalidMessage: 'Invalid slot' }),
  removeSlot: intent('removeSlot', SlotIdDto),
  move: intent('move', MoveSlotDto),
};

export async function action({ request, params, context }: Route.ActionArgs) {
  const athlete = requireAthlete(context);
  const planId = params.planId;
  const planService = context.get(planServiceContext);

  /**
   * Activating and deactivating differ only in which method they call.
   */
  const setActive = async (active: boolean) => {
    const outcome = active ? await planService.activate(athlete, planId) : await planService.deactivate(athlete, planId);

    if (outcome.ok) {
      requestLogger(context).log(`${active ? 'activated' : 'deactivated'} plan ${planId} for user ${athlete.id}`, 'Plans');
    }
    return settle(outcome);
  };

  return dispatch(request, [
    ...forkableHandlers(page, planService, {
      athlete: athlete,
      id: planId,
      log: (message) => requestLogger(context).log(message, 'Plans'),
    }),
    handled(intents.reanchor, async ({ anchorDate }) =>
      settle(await planService.reanchor(athlete, planId, DateOnly.parse(anchorDate))),
    ),
    handled(intents.activate, () => setActive(true)),
    handled(intents.deactivate, () => setActive(false)),

    // Sharing answers with a redirect rather than `settle`, so the page it
    // lands on can open the dialog. Sharing a *sample* forks it first, and
    // then the link belongs to the fork - `forkedId` is the row the token
    // was actually minted on, and the one whose URL has to be shown.
    handled(intents.share, async () => {
      const outcome = await planService.share(athlete, planId);

      if (!outcome.ok) {
        page.notFound();
      }

      const sharedId = outcome.value.forkedId ?? planId;
      requestLogger(context).log(`shared plan ${sharedId} for user ${athlete.id}`, 'Plans');
      throw redirect(`/plans/${sharedId}?share`);
    }),

    handled(intents.unshare, async () => {
      const outcome = await planService.unshare(athlete, planId);
      if (outcome.ok) {
        requestLogger(context).log(`revoked the share link for plan ${planId} for user ${athlete.id}`, 'Plans');
      }
      return settle(outcome);
    }),
    handled(intents.addSlot, async ({ workoutId }) =>
      settle(await planService.addSlot(athlete, planId, workoutId === 'rest' ? null : workoutId)),
    ),
    handled(intents.removeSlot, async ({ slotId }) => settle(await planService.removeSlot(athlete, planId, slotId))),
    handled(intents.move, async ({ slotId, direction }) =>
      settle(await planService.moveSlot(athlete, planId, slotId, direction)),
    ),
  ]);
}

function DayRow({
  slot,
  index,
  count,
  workoutById,
}: {
  slot: PlanSlotView;
  index: number;
  count: number;
  workoutById: Map<string, WorkoutSummary>;
}) {
  const exerciseCount = slot.workoutId ? workoutById.get(slot.workoutId)?.exerciseCount : undefined;

  return (
    <BuilderRow
      position={index + 1}
      title={
        slot.isRestDay ? (
          <span className="inline-flex items-center gap-1.5">
            <MoonIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
            Rest day
          </span>
        ) : (
          slot.workoutName
        )
      }
      chips={
        exerciseCount !== undefined ? (
          <Badge variant="outline" className="font-normal">
            {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'}
          </Badge>
        ) : undefined
      }
      controls={
        <RowMoveButtons
          move={intents.move}
          id={slot.id}
          idField="slotId"
          label={`day ${index + 1}`}
          index={index}
          count={count}
        />
      }
      menu={<RowRemoveMenu remove={intents.removeSlot} id={slot.id} idField="slotId" label={`day ${index + 1}`} />}
    />
  );
}

type PaletteItem = { id: string; label: string };

function PaletteSlotRow({ item }: { item: PaletteItem }) {
  return (
    <Form method="post">
      <input {...intents.addSlot.field} />
      <input type="hidden" name="workoutId" value={item.id} />
      <button
        type="submit"
        className="hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-(--dur-fast)"
      >
        {item.id === 'rest' ? <MoonIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" /> : null}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <PlusIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
      </button>
    </Form>
  );
}

/**
 * The athlete's workouts, plus a pinned "Rest day" pseudo-item, ahead of the
 * search filter - a rest day isn't a workout, and unlike the exercise
 * palette a workout is never disabled once used: a plan can repeat the same
 * training day, or rest, on as many slots as it likes.
 */
function PlanPalette({ workoutList }: { workoutList: WorkoutSummary[] }) {
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () => (needle === '' ? workoutList : workoutList.filter((workout) => workout.name.toLowerCase().includes(needle))),
    [workoutList, needle],
  );

  const items: PaletteItem[] = [
    { id: 'rest', label: 'Rest day' },
    ...visible.map((workout) => ({ id: workout.id, label: workout.name })),
  ];

  return (
    <BuilderPalette
      items={items}
      getKey={(item) => item.id}
      emptyLabel="No workouts match"
      filters={<BuilderPaletteSearch value={query} onChange={setQuery} placeholder="Search workouts…" />}
      renderItem={(item) => <PaletteSlotRow item={item} />}
    />
  );
}

export default function PlanDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { plan, workouts: workoutList, share, todayStr } = loaderData;

  const slotCount = plan.slots.length;
  const { isSample, isCustomized } = plan;
  const workoutById = new Map(workoutList.map((workout) => [workout.id, workout]));

  // The share action redirects back here with `?share`, which is what opens
  // the dialog - open state is derived from the URL rather than local
  // component state, since the fork a *sample* plan takes on first share
  // lands on a different URL entirely. Closing drops the parameter so a
  // reload doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  const shareOpen = share !== null && searchParams.has('share');
  const setShareOpen = (open: boolean) => {
    if (open) {
      return;
    }

    setSearchParams(
      (params) => {
        params.delete('share');
        return params;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const reanchorError = intents.reanchor.errorIn(actionData);

  const palette = <PlanPalette workoutList={workoutList} />;

  // Every slot's `nextDate` is today or later, and exactly one - the slot
  // due today - has the earliest of them, so the minimum doubles as
  // "today" without the loader having to say so separately.
  const todayDate =
    slotCount > 0 ? plan.slots.reduce((min, slot) => (slot.nextDate < min.nextDate ? slot : min)).nextDate : null;

  return (
    <Page width="full">
      <PageHeader
        title={plan.name}
        badge={
          <>
            {plan.isActive ? <Badge variant="brand">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
            <OwnershipBadge isSample={isSample} isCustomized={isCustomized} />
          </>
        }
        description={
          slotCount > 0
            ? `A ${slotCount}-day cycle that repeats from its anchor date.`
            : 'An empty cycle. Add days from the palette to give it a shape.'
        }
        actions={
          <ForkableActions page={page} name={plan.name} isSample={isSample} isCustomized={isCustomized} actionData={actionData}>
            <RenameDisclosure label="Anchor date">
              <Form method="post">
                <input {...intents.reanchor.field} />
                <DateField
                  key={plan.anchorDate}
                  name="anchorDate"
                  label="Anchor date"
                  today={todayStr}
                  defaultValue={plan.anchorDate}
                  description={`Day 1 of the cycle falls on this date, and it repeats every ${slotCount || 'N'} days from there.`}
                  error={reanchorError}
                  action={
                    <SubmitButton size="sm" match={intents.reanchor.match} pendingLabel="Saving">
                      Save
                    </SubmitButton>
                  }
                />
              </Form>
            </RenameDisclosure>
            <Form method="post">
              <input {...(plan.isActive ? intents.deactivate : intents.activate).field} />
              <SubmitButton
                variant={plan.isActive ? 'outline' : 'brand'}
                size="sm"
                match={(plan.isActive ? intents.deactivate : intents.activate).match}
                pendingLabel="Updating plan"
              >
                <PowerIcon aria-hidden="true" />
                {plan.isActive ? 'Deactivate' : 'Set active'}
              </SubmitButton>
            </Form>
            <Form method="post">
              <input {...intents.share.field} />
              <SubmitButton variant="outline" size="sm" match={intents.share.match} pendingLabel="Building share link">
                <Share2Icon aria-hidden="true" />
                {share ? 'Show link' : 'Share'}
              </SubmitButton>
            </Form>
          </ForkableActions>
        }
      />

      <CustomizedNote page={page} isCustomized={isCustomized} />

      <Section title="Days" description="Each day is one of your workouts or a rest day, in cycle order.">
        <BuilderFrame
          addLabel="Add day"
          addTitle="Add a day"
          palette={palette}
          outline={
            slotCount > 0 && todayDate ? (
              <BuilderOutline>
                {plan.slots.map((slot, index) => (
                  <BuilderOutlineItem
                    key={slot.id}
                    position={index + 1}
                    label={formatRelativeDate(slot.nextDate, todayDate)}
                    sublabel={slot.isRestDay ? 'Rest day' : slot.workoutName}
                    active={slot.nextDate === todayDate}
                    wrapLabel
                  />
                ))}
              </BuilderOutline>
            ) : null
          }
          rows={plan.slots.map((slot, index) => (
            <DayRow key={slot.id} slot={slot} index={index} count={slotCount} workoutById={workoutById} />
          ))}
          empty={
            <EmptyState icon={CalendarPlusIcon} title="No days yet" description="Add the first day from the palette." compact />
          }
        />

        {workoutList.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">
            You don't have any workouts yet —{' '}
            <Link
              to="/workouts"
              className="text-foreground decoration-brand-strong font-medium underline decoration-2 underline-offset-4 hover:decoration-4"
            >
              create one
            </Link>{' '}
            to add it as a day here.
          </p>
        ) : null}
      </Section>

      {share ? (
        <SharePlanDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          planName={plan.name}
          shareUrl={share.url}
          qr={share.qr}
          unshare={intents.unshare}
        />
      ) : null}
    </Page>
  );
}
