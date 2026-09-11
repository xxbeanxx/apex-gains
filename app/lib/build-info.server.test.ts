import { afterEach, describe, expect, it } from 'vitest';

import { getBuildDetails, getBuildInfo } from '~/lib/build-info';

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

describe('getBuildDetails', () => {
  const originalVersionTag = process.env.VERSION_TAG;

  afterEach(() => {
    if (originalVersionTag === undefined) {
      delete process.env.VERSION_TAG;
    } else {
      process.env.VERSION_TAG = originalVersionTag;
    }
  });

  it('splits a container-baked VERSION_TAG into its date, revision and id', () => {
    // 0x0000002a is 42 - 1970-01-01T00:00:42Z once read as a Unix timestamp.
    process.env.VERSION_TAG = '20260901-abcd1234-0000002a';

    expect(getBuildDetails()).toMatchObject({
      imageTag: '20260901-abcd1234-0000002a',
      buildRevision: 'abcd1234',
      buildId: '0000002a',
      buildDate: '1970-01-01T00:00:42.000Z',
    });
  });

  it('falls back to the bare commit SHA as the revision otherwise, with no build date or id', () => {
    delete process.env.VERSION_TAG;

    const details = getBuildDetails();

    expect(details.buildRevision).toBe(details.imageTag);
    expect(details.buildId).toBeNull();
    expect(details.buildDate).toBeNull();
  });

  it('reports the running process, not just the build', () => {
    const details = getBuildDetails();

    expect(details.nodeEnv).toBeTypeOf('string');
    expect(details.hostname.length).toBeGreaterThan(0);
    expect(new Date(details.serverStartedAt).toString()).not.toBe('Invalid Date');
  });
});
