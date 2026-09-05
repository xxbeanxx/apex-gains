import { createCookie } from 'react-router';
import { describe, expect, it } from 'vitest';

import { clearOidcState, parseOidcState, serializeOidcState } from './oidc-state.server';

const cookie = createCookie('__oidc_state', {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: false,
  maxAge: 60 * 10,
  secrets: ['test-secret'],
});

describe('oidc-state.server', () => {
  it('round-trips serialized state through parse', async () => {
    const data = {
      codeVerifier: 'verifier-123',
      nonce: 'nonce-abc',
      state: 'state-abc',
      redirectTo: '/today',
    };

    const cookieHeader = await serializeOidcState(cookie, data);
    const parsed = await parseOidcState(cookie, cookieHeader);

    expect(parsed).toEqual(data);
  });

  it('returns null for a missing cookie header', async () => {
    expect(await parseOidcState(cookie, null)).toBeNull();
  });

  it('returns null for an unrelated cookie header', async () => {
    expect(await parseOidcState(cookie, 'other_cookie=1')).toBeNull();
  });

  it('returns null when the cookie value has been tampered with', async () => {
    const cookieHeader = await serializeOidcState(cookie, {
      codeVerifier: 'verifier-123',
      nonce: 'nonce-abc',
      state: 'state-abc',
      redirectTo: '/today',
    });
    const tampered = cookieHeader.replace('__oidc_state=', '__oidc_state=x');

    expect(await parseOidcState(cookie, tampered)).toBeNull();
  });

  it('clears the cookie with maxAge 0', async () => {
    const cleared = await clearOidcState(cookie);
    expect(cleared).toMatch(/^__oidc_state=;/);
    expect(cleared).toMatch(/Max-Age=0/);
  });
});
