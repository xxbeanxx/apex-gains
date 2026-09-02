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
  layout("routes/_protected.tsx", [
    route("today", "routes/today.tsx"),
    route("exercises", "routes/exercises.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),
] satisfies RouteConfig;
