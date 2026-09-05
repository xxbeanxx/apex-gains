import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarPlusIcon,
  MoonIcon,
  PowerIcon,
  RotateCcwIcon,
  Share2Icon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
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
import { Link, data, redirect, useSearchParams } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { OwnershipBadge, RevertOrDeleteForm } from '~/components/forkable-header';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { ShareRoutineDialog } from '~/components/share-routine-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { DateOnly } from '~/domain/values/date-only';
import { requestLogger } from '~/lib/logger.server';
import { intent } from '~/lib/intent';
import { forkableDetail, type ForkableDetail } from '~/lib/forkable-detail.server';
import { dispatch, handled } from '~/lib/intent.server';
import { encodeQr } from '~/lib/qr.server';
import { shareUrlFor } from '~/lib/share-link.server';
import { IsDateOnly, trim } from '~/lib/validate-form';

import { routineServiceContext, templateServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/routines.$routineId';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.routine.name ?? 'Routine'} - Apex Gains` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const routineService = context.get(routineServiceContext);
  const routine = await routineService.detail(athlete, params.routineId);
  if (!routine) page.notFound();

  const templateService = context.get(templateServiceContext);

  // Encoded here rather than in the browser: the library stays out of the
  // client bundle, and the dialog has a scannable code on first paint.
  const shareUrl = routine.shareToken === null ? null : shareUrlFor(request, routine.shareToken);

  return {
    routine,
    templates: await templateService.listForPicker(athlete),
    share: shareUrl === null ? null : { url: shareUrl, qr: encodeQr(shareUrl) },
  };
}

class RenameRoutineDto {
  @Expose()
  @Transform(trim())
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  readonly name!: string;
}

class ReanchorRoutineDto {
  @Expose()
  @IsDateOnly()
  readonly anchorDate!: string;
}

/** A routine slot names either a template by id, or the sentinel `'rest'` for a rest day. */
@ValidatorConstraint({ name: 'isTemplateSlotId' })
class IsTemplateSlotIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return value === 'rest' || (typeof value === 'string' && isUUID(value));
  }
}

class AddSlotDto {
  @Expose()
  @Validate(IsTemplateSlotIdConstraint)
  readonly templateId!: string;
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
const page: ForkableDetail = forkableDetail({ noun: 'Routine', indexPath: '/routines', pathFor: (id) => `/routines/${id}` });
const { settle } = page;

const intents = {
  delete: intent('delete'),
  revert: intent('revert'),
  rename: intent('rename', RenameRoutineDto, { invalidMessage: 'Invalid name' }),
  reanchor: intent('reanchor', ReanchorRoutineDto, { invalidMessage: 'Invalid date' }),
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
  const routineId = params.routineId;
  const routineService = context.get(routineServiceContext);

  /** Activating and deactivating differ only in which method they call. */
  const setActive = async (active: boolean) => {
    const outcome = active
      ? await routineService.activate(athlete, routineId)
      : await routineService.deactivate(athlete, routineId);

    if (outcome.ok) {
      requestLogger(context).log(
        `${active ? 'activated' : 'deactivated'} routine ${routineId} for user ${athlete.id}`,
        'Routines',
      );
    }
    return settle(outcome);
  };

  return dispatch(request, [
    handled(intents.delete, async () =>
      page.deleted(intents.delete, await routineService.remove(athlete, routineId), () =>
        requestLogger(context).log(`deleted routine ${routineId} for user ${athlete.id}`, 'Routines'),
      ),
    ),

    handled(intents.revert, async () => page.reverted(intents.revert, await routineService.revert(athlete, routineId))),

    handled(intents.rename, async ({ name }) => settle(await routineService.rename(athlete, routineId, name))),
    handled(intents.reanchor, async ({ anchorDate }) =>
      settle(await routineService.reanchor(athlete, routineId, DateOnly.parse(anchorDate))),
    ),
    handled(intents.activate, () => setActive(true)),
    handled(intents.deactivate, () => setActive(false)),

    // Sharing answers with a redirect rather than `settle`, so the page it
    // lands on can open the dialog. Sharing a *sample* forks it first, and
    // then the link belongs to the fork - `forkedId` is the row the token
    // was actually minted on, and the one whose URL has to be shown.
    handled(intents.share, async () => {
      const outcome = await routineService.share(athlete, routineId);
      if (!outcome.ok) page.notFound();

      const sharedId = outcome.value.forkedId ?? routineId;
      requestLogger(context).log(`shared routine ${sharedId} for user ${athlete.id}`, 'Routines');
      throw redirect(`/routines/${sharedId}?share`);
    }),

    handled(intents.unshare, async () => {
      const outcome = await routineService.unshare(athlete, routineId);
      if (outcome.ok) {
        requestLogger(context).log(`revoked the share link for routine ${routineId} for user ${athlete.id}`, 'Routines');
      }
      return settle(outcome);
    }),
    handled(intents.addSlot, async ({ templateId }) =>
      settle(await routineService.addSlot(athlete, routineId, templateId === 'rest' ? null : templateId)),
    ),
    handled(intents.removeSlot, async ({ slotId }) => settle(await routineService.removeSlot(athlete, routineId, slotId))),
    handled(intents.move, async ({ slotId, direction }) =>
      settle(await routineService.moveSlot(athlete, routineId, slotId, direction)),
    ),
  ]);
}

export default function RoutineDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { routine, templates: templateList, share } = loaderData;

  const slotCount = routine.slots.length;
  const { isSample, isCustomized } = routine;

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
  const addSlotError = intents.addSlot.errorIn(actionData);

  return (
    <Page width="narrow">
      <PageHeader
        title={routine.name}
        badge={
          <>
            {routine.isActive ? <Badge variant="brand">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
            <OwnershipBadge isSample={isSample} isCustomized={isCustomized} />
          </>
        }
        description={
          slotCount > 0
            ? `A ${slotCount}-day cycle that repeats from its anchor date.`
            : 'An empty cycle. Add day-slots below to give it a shape.'
        }
        actions={
          <>
            <form method="post">
              <input {...(routine.isActive ? intents.deactivate : intents.activate).field} />
              <SubmitButton
                variant={routine.isActive ? 'outline' : 'brand'}
                size="sm"
                match={(routine.isActive ? intents.deactivate : intents.activate).match}
                pendingLabel="Updating routine"
              >
                <PowerIcon aria-hidden="true" />
                {routine.isActive ? 'Deactivate' : 'Set active'}
              </SubmitButton>
            </form>
            <form method="post">
              <input {...intents.share.field} />
              <SubmitButton variant="outline" size="sm" match={intents.share.match} pendingLabel="Building share link">
                <Share2Icon aria-hidden="true" />
                {share ? 'Show link' : 'Share'}
              </SubmitButton>
            </form>
            <RevertOrDeleteForm
              noun="routine"
              isSample={isSample}
              isCustomized={isCustomized}
              revert={intents.revert}
              remove={intents.delete}
              actionData={actionData}
            />
          </>
        }
      />

      {isCustomized ? (
        <p className="mt-(--section-gap) text-sm text-muted-foreground">
          This is your customized copy of a sample routine. The original sample is unaffected.
        </p>
      ) : null}

      <div className="mt-(--section-gap) grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rename</CardTitle>
            {isSample ? (
              <p className="text-sm text-muted-foreground">Editing a sample routine creates your own customized copy.</p>
            ) : null}
          </CardHeader>
          <CardContent>
            <form method="post">
              <input {...intents.rename.field} />
              <Field
                label="Name"
                error={renameError}
                action={
                  <SubmitButton match={intents.rename.match} pendingLabel="Saving">
                    Save
                  </SubmitButton>
                }
              >
                <Input name="name" defaultValue={routine.name} required />
              </Field>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anchor date</CardTitle>
          </CardHeader>
          <CardContent>
            <form method="post">
              <input {...intents.reanchor.field} />
              <Field
                label="Anchor date"
                description={`Day 1 of the cycle falls on this date, and it repeats every ${slotCount || 'N'} days from there.`}
                error={reanchorError}
                action={
                  <SubmitButton match={intents.reanchor.match} pendingLabel="Saving">
                    Save
                  </SubmitButton>
                }
              >
                <Input name="anchorDate" type="date" defaultValue={routine.anchorDate} required />
              </Field>
            </form>
          </CardContent>
        </Card>
      </div>

      <Section title="Days" description="Each day is one of your templates or a rest day, in cycle order.">
        {slotCount === 0 ? (
          <EmptyState
            icon={CalendarPlusIcon}
            title="No days yet"
            description="Add the first day-slot using the form below."
            compact
          />
        ) : (
          <ol className="grid gap-3 lg:grid-cols-2">
            {routine.slots.map((slot, index) => {
              const isRest = slot.isRestDay;
              return (
                <li
                  key={slot.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm shadow-black/[0.03] transition-colors duration-(--dur) hover:border-ring/30 dark:shadow-black/20"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground tabular-nums"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Day {index + 1}</p>
                      <p className="flex items-center gap-1.5 truncate font-medium">
                        {isRest ? (
                          <>
                            <MoonIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            Rest
                          </>
                        ) : (
                          slot.templateName
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
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
                      <Button type="submit" variant="ghost" size="icon-sm" disabled={index === slotCount - 1}>
                        <ArrowDownIcon aria-hidden="true" />
                        <span className="sr-only">Move day {index + 1} down</span>
                      </Button>
                    </form>
                    <form method="post">
                      <input {...intents.removeSlot.field} />
                      <input type="hidden" name="slotId" value={slot.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-sm"
                        className="hover:bg-destructive/10 hover:text-destructive"
                      >
                        <XIcon aria-hidden="true" />
                        <span className="sr-only">Remove day {index + 1} from this routine</span>
                      </Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Add a day</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form method="post">
              <input {...intents.addSlot.field} />
              <Field
                label="Day type"
                error={addSlotError}
                action={
                  <SubmitButton match={intents.addSlot.match} pendingLabel="Adding day">
                    Add
                  </SubmitButton>
                }
              >
                {({ id }) => (
                  <Select name="templateId" defaultValue="rest">
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rest">Rest day</SelectItem>
                      {templateList.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </form>
            {templateList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You don't have any templates yet —{' '}
                <Link
                  to="/templates"
                  className="font-medium text-foreground underline decoration-brand-strong decoration-2 underline-offset-4 hover:decoration-4"
                >
                  create one
                </Link>{' '}
                to add it as a day here.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </Section>

      {share ? (
        <ShareRoutineDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          routineName={routine.name}
          shareUrl={share.url}
          qr={share.qr}
          unshare={intents.unshare}
        />
      ) : null}
    </Page>
  );
}
