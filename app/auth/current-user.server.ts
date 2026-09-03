import type { MiddlewareFunction } from "react-router";

import { getAthletesRepository } from "~/repositories/athletes-repository.server";

import { getSession } from "./session.server";
import { userContext } from "./user-context";

export const loadUserMiddleware: MiddlewareFunction<void | Response> = async ({
  request,
  context,
}) => {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");

  if (!userId) { return; }

  const athletesRepository = await getAthletesRepository();
  const athlete = await athletesRepository.findById(userId);

  if (athlete) { context.set(userContext, athlete); }
};
