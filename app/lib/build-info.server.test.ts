import { afterEach, describe, expect, it } from 'vitest';

import { getBuildInfo } from './build-info';

describe('getBuildInfo', () => {
  const originalVersionTag = process.env.VERSION_TAG;

  afterEach(() => {
    if (originalVersionTag === undefined) {
      delete process.env.VERSION_TAG;
    } else {
      process.env.VERSION_TAG = originalVersionTag;
    }
  });

  it('returns VERSION_TAG when the container set one', () => {
    process.env.VERSION_TAG = '20260901-abcd1234-0000002a';

    expect(getBuildInfo()).toBe('20260901-abcd1234-0000002a');
  });

  it("falls back to the working tree's short commit SHA otherwise", () => {
    delete process.env.VERSION_TAG;

    expect(getBuildInfo()).toMatch(/^[0-9a-f]{8}$/);
  });
});
