import type { MiddlewareFunction } from "react-router";

import {
  athletesRepositoryContext,
  sessionStorageContext,
} from "~/lib/nest-bridge.server";

import { userContext } from "./user-context";

export const loadUserMiddleware: MiddlewareFunction<void | Response> = async ({
  request,
  context,
}) => {
  const sessionStorage = context.get(sessionStorageContext);
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie"),
  );
  const userId = session.get("userId");

  if (!userId) { return; }

  const athletesRepository = context.get(athletesRepositoryContext);
  const athlete = await athletesRepository.findById(userId);

  if (athlete) { context.set(userContext, athlete); }
};
