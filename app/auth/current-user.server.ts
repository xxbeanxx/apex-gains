import { eq } from "drizzle-orm";
import type { MiddlewareFunction } from "react-router";

import { db } from "~/db/index.server";
import { users } from "~/db/schema";

import { getSession } from "./session.server";
import { userContext } from "./user-context";

export const loadUserMiddleware: MiddlewareFunction<void | Response> = async ({
  request,
  context,
}) => {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  if (!userId) return;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user) {
    context.set(userContext, user);
  }
};
