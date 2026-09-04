import { redirect } from "react-router";

import { ErrorPage } from "~/components/error-page";
import { loggerContext } from "~/lib/logger.server";

import {
  appConfigContext,
  athletesRepositoryContext,
  sessionStorageContext,
} from "~/lib/nest-bridge.server";

import type { Route } from "./+types/auth.test-login";

// No `default` export: this route only ever redirects on success. An
// ErrorBoundary export is still required so React Router renders errors
// through the normal styled document instead of treating this as a raw
// resource route (see the loader below).
export { ErrorPage as ErrorBoundary };

// Test-only stand-in for the Google OAuth flow: e2e suites (Playwright)
// can't drive Google's real consent screen, so this signs a request in
// directly by email, creating the user on first use exactly like the real
// callback does. Gated on ENABLE_TEST_LOGIN so it 404s unless explicitly
// turned on - that flag must never be set on the deployed app.
export async function loader({ request, context }: Route.LoaderArgs) {
  if (!context.get(appConfigContext).enableTestLogin) {
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

  const athletesRepository = context.get(athletesRepositoryContext);
  const existingUser = await athletesRepository.findByEmail(email);

  const user =
    existingUser ??
    (await athletesRepository.create({
      googleSub: `test-login:${email}`,
      email,
      name,
      avatarUrl: null,
    }));

  logger.info({ userId: user.id, newUser: !existingUser }, "test login used");

  const sessionStorage = context.get(sessionStorageContext);
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie"),
  );
  session.set("userId", user.id);

  return redirect(redirectTo, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
}
