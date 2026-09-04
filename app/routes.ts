import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('auth/google', 'routes/auth.google.tsx'),
  route('auth/google/callback', 'routes/auth.google.callback.tsx'),
  route('auth/logout', 'routes/auth.logout.tsx'),
  route('auth/test-login', 'routes/auth.test-login.tsx'),
  layout('routes/_protected.tsx', [
    route('today', 'routes/today.tsx'),
    route('exercises', 'routes/exercises.tsx'),
    route('exercises/:exerciseId/history', 'routes/exercises.$exerciseId.history.tsx'),
    route('templates', 'routes/templates.tsx'),
    route('templates/:templateId', 'routes/templates.$templateId.tsx'),
    route('routines', 'routes/routines.tsx'),
    route('routines/:routineId', 'routes/routines.$routineId.tsx'),
    route('history', 'routes/history.tsx'),
    route('weight', 'routes/weight.tsx'),
    route('settings', 'routes/settings.tsx'),
    layout('routes/_admin.tsx', [
      route('admin', 'routes/admin.tsx'),
      route('admin/users', 'routes/admin.users.tsx'),
      route('admin/users/:userId', 'routes/admin.users.$userId.tsx'),
    ]),
  ]),
] satisfies RouteConfig;
