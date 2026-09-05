/**
 * Unguessable strings that appear in URLs - a routine's share token is the
 * only one so far.
 *
 * A port rather than a call to `crypto`, for the same reason `IdGenerator`
 * is one: an aggregate mints its own token, and that has to work in a test
 * without stubbing a global.
 *
 * Deliberately not `IdGenerator`. A share token is bearer authorization -
 * whoever holds it may import the routine - so it must never be confusable
 * with a row id that leaks through a URL or a log line, and it is short
 * enough to keep a scannable QR code small.
 */
export interface SecretGenerator {
  next(): string;
}

/** 128 bits, base64url, no padding - 22 characters. */
export const randomSecrets: SecretGenerator = {
  next: () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
  },
};

/**
 * Deterministic generator for tests: `sequentialSecrets("tok")` yields
 * "tok-1", "tok-2", ... so an assertion can name the token it expects.
 */
export function sequentialSecrets(prefix: string): SecretGenerator {
  let n = 0;
  return { next: () => `${prefix}-${++n}` };
}
