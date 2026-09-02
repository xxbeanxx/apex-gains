import { createCookie } from "react-router";

import { getSessionSecret } from "./env.server";

type OidcState = {
  codeVerifier: string;
  state: string;
  redirectTo: string;
};

const cookie = createCookie("__oidc_state", {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 10,
  secrets: [getSessionSecret()],
});

export async function serializeOidcState(data: OidcState): Promise<string> {
  return cookie.serialize(data);
}

export async function parseOidcState(
  cookieHeader: string | null,
): Promise<OidcState | null> {
  const value = await cookie.parse(cookieHeader);
  if (
    !value ||
    typeof value.codeVerifier !== "string" ||
    typeof value.state !== "string" ||
    typeof value.redirectTo !== "string"
  ) {
    return null;
  }
  return value as OidcState;
}

export async function clearOidcState(): Promise<string> {
  return cookie.serialize("", { maxAge: 0 });
}
