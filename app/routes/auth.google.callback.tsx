import * as client from "openid-client";
import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { getOrigin } from "~/auth/env.server";
import { clearOidcState, parseOidcState } from "~/auth/oidc-state.server";
import { getGoogleConfig } from "~/auth/oidc.server";
import { commitSession, getSession } from "~/auth/session.server";
import { db } from "~/db/index.server";
import { users } from "~/db/schema";

import type { Route } from "./+types/auth.google.callback";

export async function loader({ request }: Route.LoaderArgs) {
  const state = await parseOidcState(request.headers.get("Cookie"));
  if (!state) {
    throw redirect("/auth/google");
  }

  const config = await getGoogleConfig();
  const tokens = await client.authorizationCodeGrant(
    config,
    new URL(request.url),
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

  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", user.id);

  const headers = new Headers();
  headers.append("Set-Cookie", await commitSession(session));
  headers.append("Set-Cookie", await clearOidcState());

  return redirect(state.redirectTo, { headers });
}
