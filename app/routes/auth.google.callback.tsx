import * as client from "openid-client";
import { redirect } from "react-router";

import { getOrigin } from "~/auth/env.server";
import { clearOidcState, parseOidcState } from "~/auth/oidc-state.server";
import { getGoogleConfig } from "~/auth/oidc.server";
import { commitSession, getSession } from "~/auth/session.server";
import { ErrorPage } from "~/components/error-page";
import { loggerContext } from "~/lib/logger.server";
import { getAthletesRepository } from "~/repositories/athletes-repository.server";

import type { Route } from "./+types/auth.google.callback";

// No `default` export: this route only ever redirects on success. An
// ErrorBoundary export is still required so React Router renders errors
// through the normal styled document instead of treating this as a raw
// resource route.
export { ErrorPage as ErrorBoundary };

export async function loader({ request, context }: Route.LoaderArgs) {
  const logger = context.get(loggerContext);

  const state = await parseOidcState(request.headers.get("Cookie"));
  if (!state) {
    logger.warn("google oauth callback with missing/expired state cookie");
    throw redirect("/auth/google");
  }

  const config = await getGoogleConfig();

  // openid-client derives the redirect_uri it validates against Google from
  // this URL's origin (stripping query params), not from the redirect_uri
  // passed below. Rebuild the origin from ORIGIN rather than trusting
  // request.url's, since ORIGIN is the exact value registered with Google
  // and request.url's origin depends on how the deployed server derives it
  // from forwarded headers (see server.ts).
  const requestUrl = new URL(request.url);
  const currentUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    getOrigin(),
  );

  const tokens = await client.authorizationCodeGrant(
    config,
    currentUrl,
    {
      pkceCodeVerifier: state.codeVerifier,
      expectedState: state.state,
    },
    {
      redirect_uri: `${getOrigin()}/auth/google/callback`,
    },
  );

  const claims = tokens.claims();
  if (!claims?.sub || typeof claims.email !== "string") {
    logger.error(
      { claims },
      "google oauth callback missing expected profile claims",
    );
    throw new Response("Google did not return the expected profile claims", {
      status: 400,
    });
  }

  const athletesRepository = await getAthletesRepository();
  const existingUser = await athletesRepository.findByGoogleSub(claims.sub);

  const user =
    existingUser ??
    (await athletesRepository.create({
      googleSub: claims.sub,
      email: claims.email,
      name: typeof claims.name === "string" ? claims.name : claims.email,
      avatarUrl: typeof claims.picture === "string" ? claims.picture : null,
    }));

  logger.info(
    { userId: user.id, newUser: !existingUser },
    existingUser ? "user logged in" : "user signed up",
  );

  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", user.id);

  const headers = new Headers();
  headers.append("Set-Cookie", await commitSession(session));
  headers.append("Set-Cookie", await clearOidcState());

  return redirect(state.redirectTo, { headers });
}
