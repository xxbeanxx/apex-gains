import type { Cookie } from 'react-router';

type OidcState = {
  codeVerifier: string;
  state: string;
  redirectTo: string;
};

export async function serializeOidcState(cookie: Cookie, data: OidcState): Promise<string> {
  return cookie.serialize(data);
}

export async function parseOidcState(cookie: Cookie, cookieHeader: string | null): Promise<OidcState | null> {
  const value = await cookie.parse(cookieHeader);

  const hasRequiredFields =
    !!value &&
    typeof value.codeVerifier === 'string' &&
    typeof value.state === 'string' &&
    typeof value.redirectTo === 'string';

  if (!hasRequiredFields) {
    return null;
  }

  return value;
}

export async function clearOidcState(cookie: Cookie): Promise<string> {
  return cookie.serialize('', { maxAge: 0 });
}
