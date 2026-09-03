import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { isTestLoginEnabled } from "~/auth/env.server";
import { commitSession, getSession } from "~/auth/session.server";
import { db } from "~/db/index.server";
import { users } from "~/db/schema";
import { loggerContext } from "~/lib/logger.server";

import type { Route } from "./+types/auth.test-login";

// Test-only stand-in for the Google OAuth flow: e2e suites (Playwright)
// can't drive Google's real consent screen, so this signs a request in
// directly by email, creating the user on first use exactly like the real
// callback does. Gated on ENABLE_TEST_LOGIN so it 404s unless explicitly
// turned on - that flag must never be set on the deployed app.
export async function loader({ request, context }: Route.LoaderArgs) {
  if (!isTestLoginEnabled()) {
    throw new Response("Not Found", { status: 404 });
  }

  const logger = context.get(loggerContext);
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  if (!email) {
    throw new Response("Missing required 'email' query parameter", {
      status: 400,
    });
  }
  const name = url.searchParams.get("name") ?? email;
  const redirectTo = url.searchParams.get("redirectTo") ?? "/today";

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const user =
    existingUser ??
    (
      await db
        .insert(users)
        .values({ googleSub: `test-login:${email}`, email, name })
        .returning()
    )[0];

  logger.info({ userId: user.id, newUser: !existingUser }, "test login used");

  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", user.id);

  return redirect(redirectTo, {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}
