import * as client from "openid-client";
import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { getOrigin } from "~/auth/env.server";
import { clearOidcState, parseOidcState } from "~/auth/oidc-state.server";
import { getGoogleConfig } from "~/auth/oidc.server";
import { commitSession, getSession } from "~/auth/session.server";
import { db } from "~/db/index.server";
import { users } from "~/db/schema";
import { loggerContext } from "~/lib/logger.server";

import type { Route } from "./+types/auth.google.callback";

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
  // passed below. request.url's origin can't be trusted for this: Azure
  // Container Apps terminates TLS at its ingress and forwards plain HTTP to
  // the container, and react-router-serve doesn't set Express's "trust
  // proxy", so request.url shows http:// even though the real request was
  // https://. Rebuild the origin from ORIGIN, which is the value actually
  // registered with Google.
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

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.googleSub, claims.sub))
    .limit(1);

  const user =
    existingUser ??
    (
      await db
        .insert(users)
        .values({
          googleSub: claims.sub,
          email: claims.email,
          name: typeof claims.name === "string" ? claims.name : claims.email,
          avatarUrl:
            typeof claims.picture === "string" ? claims.picture : null,
        })
        .returning()
    )[0];

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
