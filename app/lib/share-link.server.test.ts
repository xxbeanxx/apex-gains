import { describe, expect, it } from 'vitest';

import { sharePathFor, shareUrlFor } from './share-link.server';

describe('share links', () => {
  it('puts the token on the import route', () => {
    expect(sharePathFor('6Bx1_qZk3pQeR7tYuVwXyA')).toBe('/routines/import/6Bx1_qZk3pQeR7tYuVwXyA');
  });

  /**
   * A QR code has to carry an absolute URL, and the origin comes from the
   * request - which is the externally-visible one only because
   * `server/main.ts` trusts the proxy and normalizes `X-Forwarded-Host`.
   */
  it('builds an absolute URL from the request origin', () => {
    const request = new Request('https://apex.atomic-nucleus.com/routines/abc?share');

    expect(shareUrlFor(request, 'tok')).toBe('https://apex.atomic-nucleus.com/routines/import/tok');
  });

  it('keeps a non-default port, so a link works in development', () => {
    const request = new Request('http://localhost:3000/routines/abc');

    expect(shareUrlFor(request, 'tok')).toBe('http://localhost:3000/routines/import/tok');
  });
});
