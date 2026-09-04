import * as client from "openid-client";
import { redirect } from "react-router";

import { serializeOidcState } from "~/auth/oidc-state.server";
import { ErrorPage } from "~/components/error-page";

import {
  appConfigContext,
  oidcConfigContext,
  oidcStateCookieContext,
} from "~/lib/nest-bridge.server";

import type { Route } from "./+types/auth.google";

// No `default` export: this route only ever redirects on success. An
// ErrorBoundary export is still required so React Router renders errors
// through the normal styled document instead of treating this as a raw
// resource route.
export { ErrorPage as ErrorBoundary };

export async function loader({ request, context }: Route.LoaderArgs) {
  const config = await context.get(oidcConfigContext).get();
  const origin = context.get(appConfigContext).origin;

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") ?? "/today";

  const authorizationUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: `${origin}/auth/google/callback`,
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  return redirect(authorizationUrl.href, {
    headers: {
      "Set-Cookie": await serializeOidcState(
        context.get(oidcStateCookieContext),
        { codeVerifier, state, redirectTo },
      ),
    },
  });
}
