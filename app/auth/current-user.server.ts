import type { MiddlewareFunction } from "react-router";

import { getUsersRepository } from "~/repositories/users-repository.server";

import { getSession } from "./session.server";
import { userContext } from "./user-context";

export const loadUserMiddleware: MiddlewareFunction<void | Response> = async ({
  request,
  context,
}) => {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");

  if (!userId) { return; }

  const usersRepository = await getUsersRepository();
  const user = await usersRepository.findById(userId);

  if (user) { context.set(userContext, user); }
};
