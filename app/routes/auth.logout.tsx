import { redirect } from "react-router";

import { destroySession, getSession } from "~/auth/session.server";
import { userContext } from "~/auth/user-context";
import { ErrorPage } from "~/components/error-page";
import { loggerContext } from "~/lib/logger.server";

import type { Route } from "./+types/auth.logout";

// No `default` export: this route only ever redirects on success. An
// ErrorBoundary export is still required so React Router renders errors
// through the normal styled document instead of treating this as a raw
// resource route.
export { ErrorPage as ErrorBoundary };

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext);
  if (user) {
    context.get(loggerContext).info({ userId: user.id }, "user logged out");
  }

  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}
