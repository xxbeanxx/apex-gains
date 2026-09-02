import { Outlet } from "react-router";

import { requireUserMiddleware } from "~/auth/require-user.server";

import type { Route } from "./+types/_protected";

export const middleware: Route.MiddlewareFunction[] = [requireUserMiddleware];

export default function ProtectedLayout() {
  return <Outlet />;
}
