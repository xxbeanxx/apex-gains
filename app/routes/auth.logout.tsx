import { redirect } from "react-router";

import { destroySession, getSession } from "~/auth/session.server";
import { userContext } from "~/auth/user-context";
import { loggerContext } from "~/lib/logger.server";

import type { Route } from "./+types/auth.logout";

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
