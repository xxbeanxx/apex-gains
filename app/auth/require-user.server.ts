import type { MiddlewareFunction } from "react-router";
import { redirect } from "react-router";

import { userContext } from "./user-context";

export const requireUserMiddleware: MiddlewareFunction<void | Response> = ({
  request,
  context,
}) => {
  const user = context.get(userContext);
  if (!user) {
    const url = new URL(request.url);
    const redirectTo = `${url.pathname}${url.search}`;
    throw redirect(
      `/auth/google?redirectTo=${encodeURIComponent(redirectTo)}`,
    );
  }
};
