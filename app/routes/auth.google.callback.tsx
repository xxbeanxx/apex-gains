import * as client from "openid-client";
import { redirect } from "react-router";

import { clearOidcState, parseOidcState } from "~/auth/oidc-state.server";
import { ErrorPage } from "~/components/error-page";
import { loggerContext } from "~/lib/logger.server";

import {
  appConfigContext,
  athletesRepositoryContext,
  oidcConfigContext,
  oidcStateCookieContext,
  sessionStorageContext,
} from "~/lib/nest-bridge.server";

import type { Route } from "./+types/auth.google.callback";

// No `default` export: this route only ever redirects on success. An
// ErrorBoundary export is still required so React Router renders errors
// through the normal styled document instead of treating this as a raw
// resource route.
export { ErrorPage as ErrorBoundary };

export async function loader({ request, context }: Route.LoaderArgs) {
  const logger = context.get(loggerContext);
  const oidcStateCookie = context.get(oidcStateCookieContext);

  const state = await parseOidcState(
    oidcStateCookie,
    request.headers.get("Cookie"),
  );
  if (!state) {
    logger.warn("google oauth callback with missing/expired state cookie");
    throw redirect("/auth/google");
  }

  const config = await context.get(oidcConfigContext).get();
  const origin = context.get(appConfigContext).origin;

  // openid-client derives the redirect_uri it validates against Google from
  // this URL's origin (stripping query params), not from the redirect_uri
  // passed below. Rebuild the origin from ORIGIN rather than trusting
  // request.url's, since ORIGIN is the exact value registered with Google
  // and request.url's origin depends on how the deployed server derives it
  // from forwarded headers (see server/main.ts).
  const requestUrl = new URL(request.url);
  const currentUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    origin,
  );

  const tokens = await client.authorizationCodeGrant(
    config,
    currentUrl,
    {
      pkceCodeVerifier: state.codeVerifier,
      expectedState: state.state,
    },
    {
      redirect_uri: `${origin}/auth/google/callback`,
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

  const athletesRepository = context.get(athletesRepositoryContext);
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

  const sessionStorage = context.get(sessionStorageContext);
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie"),
  );
  session.set("userId", user.id);

  const headers = new Headers();
  headers.append("Set-Cookie", await sessionStorage.commitSession(session));
  headers.append("Set-Cookie", await clearOidcState(oidcStateCookie));

  return redirect(state.redirectTo, { headers });
}
