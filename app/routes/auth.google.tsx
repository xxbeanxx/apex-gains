import * as client from "openid-client";
import { redirect } from "react-router";

import { getOrigin } from "~/auth/env.server";
import { serializeOidcState } from "~/auth/oidc-state.server";
import { getGoogleConfig } from "~/auth/oidc.server";
import { ErrorPage } from "~/components/error-page";

import type { Route } from "./+types/auth.google";

// No `default` export: this route only ever redirects on success. An
// ErrorBoundary export is still required so React Router renders errors
// through the normal styled document instead of treating this as a raw
// resource route.
export { ErrorPage as ErrorBoundary };

export async function loader({ request }: Route.LoaderArgs) {
  const config = await getGoogleConfig();

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") ?? "/today";

  const authorizationUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: `${getOrigin()}/auth/google/callback`,
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  return redirect(authorizationUrl.href, {
    headers: {
      "Set-Cookie": await serializeOidcState({
        codeVerifier,
        state,
        redirectTo,
      }),
    },
  });
}
