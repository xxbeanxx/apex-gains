import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("auth/google", "routes/auth.google.tsx"),
  route("auth/google/callback", "routes/auth.google.callback.tsx"),
  route("auth/logout", "routes/auth.logout.tsx"),
  route("auth/test-login", "routes/auth.test-login.tsx"),
  layout("routes/_protected.tsx", [
    route("today", "routes/today.tsx"),
    route("exercises", "routes/exercises.tsx"),
    route("templates", "routes/templates.tsx"),
    route("templates/:templateId", "routes/templates.$templateId.tsx"),
    route("routines", "routes/routines.tsx"),
    route("routines/:routineId", "routes/routines.$routineId.tsx"),
    route("history", "routes/history.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),
] satisfies RouteConfig;
