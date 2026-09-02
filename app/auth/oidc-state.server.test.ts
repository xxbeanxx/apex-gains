import { describe, expect, it } from "vitest";

import { clearOidcState, parseOidcState, serializeOidcState } from "./oidc-state.server";

describe("oidc-state.server", () => {
  it("round-trips serialized state through parse", async () => {
    const data = {
      codeVerifier: "verifier-123",
      state: "state-abc",
      redirectTo: "/today",
    };

    const cookieHeader = await serializeOidcState(data);
    const parsed = await parseOidcState(cookieHeader);

    expect(parsed).toEqual(data);
  });

  it("returns null for a missing cookie header", async () => {
    expect(await parseOidcState(null)).toBeNull();
  });

  it("returns null for an unrelated cookie header", async () => {
    expect(await parseOidcState("other_cookie=1")).toBeNull();
  });

  it("returns null when the cookie value has been tampered with", async () => {
    const cookieHeader = await serializeOidcState({
      codeVerifier: "verifier-123",
      state: "state-abc",
      redirectTo: "/today",
    });
    const tampered = cookieHeader.replace("__oidc_state=", "__oidc_state=x");

    expect(await parseOidcState(tampered)).toBeNull();
  });

  it("clears the cookie with maxAge 0", async () => {
    const cleared = await clearOidcState();
    expect(cleared).toMatch(/^__oidc_state=;/);
    expect(cleared).toMatch(/Max-Age=0/);
  });
});
