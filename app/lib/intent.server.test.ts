import { Expose, Transform } from 'class-transformer';
import { IsIn, IsInt, IsString, MinLength } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { intent } from './intent.js';
import { dispatch, handled } from './intent.server';
import { toNumber, trim } from './validate-form.js';

class RenameDto {
  @Expose()
  @Transform(trim())
  @IsString()
  @MinLength(1)
  readonly name!: string;
}

class ToggleDto {
  @Expose()
  @IsIn(['true', 'false'])
  readonly showSampleData!: string;
}

class MoveDto {
  @Expose()
  @IsIn(['up', 'down'])
  readonly direction!: 'up' | 'down';

  @Expose()
  @Transform(toNumber())
  @IsInt()
  readonly position!: number;
}

/** A POST carrying the fields a browser would have submitted. */
function post(fields: Record<string, string>): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return new Request('http://localhost/test', { method: 'POST', body });
}

const rename = intent('rename', RenameDto);
const move = intent('move', MoveDto);
const remove = intent('delete');

describe('dispatch', () => {
  it('runs the handler the submission names, and no other', async () => {
    const renamed = vi.fn(async () => ({ ok: true, ran: 'rename' }));
    const moved = vi.fn(async () => ({ ok: true, ran: 'move' }));

    const result = await dispatch(post({ intent: 'move', direction: 'up', position: '2' }), [
      handled(rename, renamed),
      handled(move, moved),
    ]);

    expect(result).toEqual({ ok: true, ran: 'move' });
    expect(renamed).not.toHaveBeenCalled();
  });

  it('hands the handler its DTO already validated and transformed', async () => {
    const seen: unknown[] = [];

    await dispatch(post({ intent: 'move', direction: 'down', position: '3' }), [
      handled(move, async (input) => {
        seen.push(input);
        return { ok: true };
      }),
    ]);

    expect(seen).toEqual([{ direction: 'down', position: 3 }]);
  });

  it('applies a DTO transform before validating', async () => {
    const seen: unknown[] = [];

    await dispatch(post({ intent: 'rename', name: '  Push day  ' }), [
      handled(rename, async ({ name }) => {
        seen.push(name);
        return { ok: true };
      }),
    ]);

    expect(seen).toEqual(['Push day']);
  });

  it('ignores fields the DTO does not expose, so extra form inputs cannot leak in', async () => {
    const seen: unknown[] = [];

    await dispatch(post({ intent: 'rename', name: 'Push day', isAdmin: 'true' }), [
      handled(rename, async (input) => {
        seen.push(input);
        return { ok: true };
      }),
    ]);

    expect(seen).toEqual([{ name: 'Push day' }]);
  });

  describe('a submission that does not validate', () => {
    it('is a 400 tagged with the intent, and the handler never runs', async () => {
      const run = vi.fn(async () => ({ ok: true }));

      const result = await dispatch(post({ intent: 'rename', name: '' }), [handled(rename, run)]);

      expect(result).toMatchObject({ data: { intent: 'rename' }, init: { status: 400 } });
      expect(run).not.toHaveBeenCalled();
    });

    it("reports the failing constraint's own message by default", async () => {
      const result = await dispatch(post({ intent: 'rename', name: '' }), [handled(rename, async () => ({ ok: true }))]);

      expect(result).toMatchObject({ data: { error: expect.stringContaining('name') } });
    });

    it('reports the declared message instead when one is given', async () => {
      const named = intent('rename', RenameDto, { invalidMessage: 'Invalid name' });

      const result = await dispatch(post({ intent: 'rename', name: '' }), [handled(named, async () => ({ ok: true }))]);

      expect(result).toMatchObject({ data: { error: 'Invalid name' } });
    });
  });

  describe('an intent with no schema', () => {
    it('runs without validating anything', async () => {
      const result = await dispatch(post({ intent: 'delete' }), [handled(remove, async () => ({ ok: true, gone: true }))]);

      expect(result).toEqual({ ok: true, gone: true });
    });
  });

  describe('fields', () => {
    /**
     * An unchecked checkbox is absent from a submission entirely, so the
     * default source has nothing to validate; `fields` is how a form spells
     * that absence as a value.
     */
    it('validates what the intent selects rather than the whole submission', async () => {
      const toggle = intent('toggle', ToggleDto, {
        fields: (formData) => ({ showSampleData: formData.get('showSampleData') ?? 'false' }),
      });
      const seen: unknown[] = [];

      await dispatch(post({ intent: 'toggle' }), [
        handled(toggle, async (input) => {
          seen.push(input);
          return { ok: true };
        }),
      ]);

      expect(seen).toEqual([{ showSampleData: 'false' }]);
    });
  });

  describe('an intent the page never declared', () => {
    it('is a 400 rather than a silent success', async () => {
      const result = await dispatch(post({ intent: 'somethingElse' }), [handled(rename, async () => ({ ok: true }))]);

      expect(result).toMatchObject({ data: { error: 'Unknown action', intent: 'somethingElse' }, init: { status: 400 } });
    });

    it('is a 400 when no intent was submitted at all', async () => {
      const result = await dispatch(post({}), [handled(rename, async () => ({ ok: true }))]);

      expect(result).toMatchObject({ data: { error: 'Unknown action', intent: 'unknown' }, init: { status: 400 } });
    });
  });

  it('lets a handler answer by throwing, which is how a redirect or a 404 leaves', async () => {
    const thrown = new Response(null, { status: 302, headers: { Location: '/plans' } });

    await expect(
      dispatch(post({ intent: 'delete' }), [
        handled(remove, () => {
          throw thrown;
        }),
      ]),
    ).rejects.toBe(thrown);
  });
});
