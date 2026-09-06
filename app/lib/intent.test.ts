import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { intent } from '~/lib/intent';

class RenameDto {
  @Expose()
  @IsString()
  readonly name!: string;
}

describe('intent', () => {
  it('derives the hidden field a form submits it with', () => {
    expect(intent('rename').field).toEqual({ type: 'hidden', name: 'intent', value: 'rename' });
  });

  it("derives the SubmitButton match, so only this form's button spins", () => {
    expect(intent('rename').match).toEqual({ intent: 'rename' });
  });

  it('carries a schema when one is given, and none when it is not', () => {
    expect(intent('rename', RenameDto).schema).toBe(RenameDto);
    expect(intent('delete').schema).toBeUndefined();
  });

  it('takes options with or without a schema', () => {
    expect(intent('rename', RenameDto, { invalidMessage: 'Bad name' }).options.invalidMessage).toBe('Bad name');
    expect(intent('delete', { invalidMessage: 'Bad' }).options.invalidMessage).toBe('Bad');
  });

  describe('reject', () => {
    it('tags a 400 with the intent that produced it', () => {
      const rejection = intent('rename').reject('Invalid name');

      expect(rejection.data).toEqual({ error: 'Invalid name', intent: 'rename' });
      expect(rejection.init?.status).toBe(400);
    });
  });

  describe('errorIn', () => {
    const rename = intent('rename');

    it('reads back a rejection this intent produced', () => {
      expect(rename.errorIn(rename.reject('Invalid name').data)).toBe('Invalid name');
    });

    it("ignores another intent's rejection, so one form's error stays on that form", () => {
      expect(rename.errorIn(intent('delete').reject('Nope').data)).toBeUndefined();
    });

    it('is undefined when nothing was submitted, or the submission succeeded', () => {
      expect(rename.errorIn(undefined)).toBeUndefined();
      expect(rename.errorIn(null)).toBeUndefined();
      expect(rename.errorIn({ ok: true, intent: 'rename' })).toBeUndefined();
    });
  });

  describe('succeededIn', () => {
    const save = intent('save');

    it('recognises its own success', () => {
      expect(save.succeededIn({ ok: true, intent: 'save' })).toBe(true);
    });

    it("does not claim another intent's success", () => {
      expect(save.succeededIn({ ok: true, intent: 'other' })).toBe(false);
    });

    it('is false for a rejection, an untagged result, and nothing at all', () => {
      expect(save.succeededIn(save.reject('nope').data)).toBe(false);
      expect(save.succeededIn({ ok: true })).toBe(false);
      expect(save.succeededIn(undefined)).toBe(false);
    });
  });
});
