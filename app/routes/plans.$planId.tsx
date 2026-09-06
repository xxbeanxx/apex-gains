import { Expose, Transform } from 'class-transformer';
import {
  isUUID,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Validate,
  type ValidatorConstraintInterface,
  ValidatorConstraint,
} from 'class-validator';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarPlusIcon,
  CopyIcon,
  EllipsisIcon,
  MoonIcon,
  PlusIcon,
  PowerIcon,
  Share2Icon,
  XIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, data, redirect, useSearchParams, useSubmit } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { BuilderCanvas } from '~/components/builder/builder-canvas';
import { BuilderLayout } from '~/components/builder/builder-layout';
import { BuilderOutline, BuilderOutlineItem } from '~/components/builder/builder-outline';
import { BuilderPalette, BuilderPaletteSearch } from '~/components/builder/builder-palette';
import { BuilderRow } from '~/components/builder/builder-row';
import { RenameDisclosure } from '~/components/builder/rename-disclosure';
import { OwnershipBadge, RevertOrDeleteForm } from '~/components/forkable-header';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { SharePlanDialog } from '~/components/share-plan-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { DateOnly } from '~/domain/values/date-only';
import { formatRelativeDate } from '~/lib/format';
import { requestLogger } from '~/lib/logger.server';
import { intent } from '~/lib/intent';
import { forkableDetail, type ForkableDetail } from '~/lib/forkable-detail.server';
import { dispatch, handled } from '~/lib/intent.server';
import { encodeQr } from '~/lib/qr.server';
import { shareUrlFor } from '~/lib/share-link.server';
import { IsDateOnly, trim } from '~/lib/validate-form';
import type { PlanSlotView } from '~/services/plan-service.server';
import type { WorkoutSummary } from '~/services/workout-service.server';

import { planServiceContext, workoutServiceContext } from '~/lib/nest-bridge.server';

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
  if (!plan) page.notFound();

  const workoutService = context.get(workoutServiceContext);

  // Encoded here rather than in the browser: the library stays out of the
  // client bundle, and the dialog has a scannable code on first paint.
  const shareUrl = plan.shareToken === null ? null : shareUrlFor(request, plan.shareToken);

  return {
    plan,
    workouts: await workoutService.listForPicker(athlete),
    share: shareUrl === null ? null : { url: shareUrl, qr: encodeQr(shareUrl) },
  };
}

class RenamePlanDto {
  @Expose()
  @Transform(trim())
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  readonly name!: string;
}

class ReanchorPlanDto {
  @Expose()
  @IsDateOnly()
  readonly anchorDate!: string;
}

/** A plan slot names either a workout by id, or the sentinel `'rest'` for a rest day. */
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
  delete: intent('delete'),
  revert: intent('revert'),
  duplicate: intent('duplicate'),
  rename: intent('rename', RenamePlanDto, { invalidMessage: 'Invalid name' }),
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

  /** Activating and deactivating differ only in which method they call. */
  const setActive = async (active: boolean) => {
    const outcome = active ? await planService.activate(athlete, planId) : await planService.deactivate(athlete, planId);

    if (outcome.ok) {
      requestLogger(context).log(`${active ? 'activated' : 'deactivated'} plan ${planId} for user ${athlete.id}`, 'Plans');
    }
    return settle(outcome);
  };

  return dispatch(request, [
    handled(intents.delete, async () =>
      page.deleted(intents.delete, await planService.remove(athlete, planId), () =>
        requestLogger(context).log(`deleted plan ${planId} for user ${athlete.id}`, 'Plans'),
      ),
    ),

    handled(intents.revert, async () => page.reverted(intents.revert, await planService.revert(athlete, planId))),

    handled(intents.duplicate, async () => {
      const outcome = await planService.duplicate(athlete, planId);
      if (!outcome.ok) page.notFound();

      requestLogger(context).log(`duplicated plan ${planId} into ${outcome.value.id} for user ${athlete.id}`, 'Plans');
      throw redirect(`/plans/${outcome.value.id}`);
    }),

    handled(intents.rename, async ({ name }) => settle(await planService.rename(athlete, planId, name))),
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
      if (!outcome.ok) page.notFound();

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

function MoveButtons({ slot, index, count }: { slot: PlanSlotView; index: number; count: number }) {
  return (
    <>
      <form method="post">
        <input {...intents.move.field} />
        <input type="hidden" name="slotId" value={slot.id} />
        <input type="hidden" name="direction" value="up" />
        <Button type="submit" variant="ghost" size="icon-sm" disabled={index === 0}>
          <ArrowUpIcon aria-hidden="true" />
          <span className="sr-only">Move day {index + 1} up</span>
        </Button>
      </form>
      <form method="post">
        <input {...intents.move.field} />
        <input type="hidden" name="slotId" value={slot.id} />
        <input type="hidden" name="direction" value="down" />
        <Button type="submit" variant="ghost" size="icon-sm" disabled={index === count - 1}>
          <ArrowDownIcon aria-hidden="true" />
          <span className="sr-only">Move day {index + 1} down</span>
        </Button>
      </form>
    </>
  );
}

/** The `⋯` menu's one action: removing the day. A plain navigation submit, same request cycle a literal form's own submit would make. */
function RowMenu({ slot, index }: { slot: PlanSlotView; index: number }) {
  const submit = useSubmit();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for day ${index + 1}`}>
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => submit({ intent: intents.removeSlot.name, slotId: slot.id }, { method: 'post' })}
        >
          <XIcon aria-hidden="true" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
            <MoonIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
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
      controls={<MoveButtons slot={slot} index={index} count={count} />}
      menu={<RowMenu slot={slot} index={index} />}
    />
  );
}

type PaletteItem = { id: string; label: string };

function PaletteSlotRow({ item }: { item: PaletteItem }) {
  return (
    <form method="post">
      <input {...intents.addSlot.field} />
      <input type="hidden" name="workoutId" value={item.id} />
      <button
        type="submit"
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-(--dur-fast) hover:bg-muted"
      >
        {item.id === 'rest' ? <MoonIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <PlusIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </form>
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
  const { plan, workouts: workoutList, share } = loaderData;

  const slotCount = plan.slots.length;
  const { isSample, isCustomized } = plan;
  const workoutById = new Map(workoutList.map((workout) => [workout.id, workout]));

  // The share action redirects back here with `?share`, which is what opens
  // the dialog - a plain form post navigates, so there is no component state
  // that survives minting the link. Closing drops the parameter so a reload
  // doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  const shareOpen = share !== null && searchParams.has('share');
  const setShareOpen = (open: boolean) => {
    if (open) return;
    setSearchParams(
      (params) => {
        params.delete('share');
        return params;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const renameError = intents.rename.errorIn(actionData);
  const reanchorError = intents.reanchor.errorIn(actionData);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);

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
          <div className="flex flex-wrap items-center gap-1.5">
            <RenameDisclosure>
              <form method="post">
                <input {...intents.rename.field} />
                <Field
                  label="Name"
                  error={renameError}
                  action={
                    <SubmitButton size="sm" match={intents.rename.match} pendingLabel="Saving">
                      Save
                    </SubmitButton>
                  }
                >
                  <Input name="name" defaultValue={plan.name} required />
                </Field>
              </form>
            </RenameDisclosure>
            <RenameDisclosure label="Anchor date">
              <form method="post">
                <input {...intents.reanchor.field} />
                <Field
                  label="Anchor date"
                  description={`Day 1 of the cycle falls on this date, and it repeats every ${slotCount || 'N'} days from there.`}
                  error={reanchorError}
                  action={
                    <SubmitButton size="sm" match={intents.reanchor.match} pendingLabel="Saving">
                      Save
                    </SubmitButton>
                  }
                >
                  <Input name="anchorDate" type="date" defaultValue={plan.anchorDate} required />
                </Field>
              </form>
            </RenameDisclosure>
            <form method="post">
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
            </form>
            <form method="post">
              <input {...intents.share.field} />
              <SubmitButton variant="outline" size="sm" match={intents.share.match} pendingLabel="Building share link">
                <Share2Icon aria-hidden="true" />
                {share ? 'Show link' : 'Share'}
              </SubmitButton>
            </form>
            <form method="post">
              <input {...intents.duplicate.field} />
              <SubmitButton variant="outline" size="sm" match={intents.duplicate.match} pendingLabel="Duplicating">
                <CopyIcon aria-hidden="true" />
                Duplicate
              </SubmitButton>
            </form>
            <RevertOrDeleteForm
              noun="plan"
              isSample={isSample}
              isCustomized={isCustomized}
              revert={intents.revert}
              remove={intents.delete}
              actionData={actionData}
            />
          </div>
        }
      />

      {isCustomized ? (
        <p className="mt-4 text-sm text-muted-foreground">
          This is your customized copy of a sample plan. The original sample is unaffected.
        </p>
      ) : null}

      <Section title="Days" description="Each day is one of your workouts or a rest day, in cycle order.">
        <Dialog open={mobilePaletteOpen} onOpenChange={setMobilePaletteOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="mb-4 w-full md:hidden">
              <PlusIcon aria-hidden="true" />
              Add day
            </Button>
          </DialogTrigger>
          <DialogContent className="p-0 sm:max-w-sm">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle>Add a day</DialogTitle>
            </DialogHeader>
            <div className="p-4">{palette}</div>
          </DialogContent>
        </Dialog>

        <BuilderLayout
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
                  />
                ))}
              </BuilderOutline>
            ) : null
          }
          canvas={
            slotCount === 0 ? (
              <EmptyState
                icon={CalendarPlusIcon}
                title="No days yet"
                description="Add the first day from the palette."
                compact
              />
            ) : (
              <BuilderCanvas>
                {plan.slots.map((slot, index) => (
                  <DayRow key={slot.id} slot={slot} index={index} count={slotCount} workoutById={workoutById} />
                ))}
              </BuilderCanvas>
            )
          }
        />

        {workoutList.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            You don't have any workouts yet —{' '}
            <Link
              to="/workouts"
              className="font-medium text-foreground underline decoration-brand-strong decoration-2 underline-offset-4 hover:decoration-4"
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
