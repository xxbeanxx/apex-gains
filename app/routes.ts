import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  //
  route('auth/google', 'routes/auth.google.tsx'),
  route('auth/google/callback', 'routes/auth.google.callback.tsx'),
  route('auth/logout', 'routes/auth.logout.tsx'),
  route('auth/test-login', 'routes/auth.test-login.tsx'),
  //
  route('routines', 'routes/legacy-redirect.tsx', { id: 'legacy-routines' }),
  route('routines/:rest/*', 'routes/legacy-redirect.tsx', { id: 'legacy-routine' }),
  route('templates', 'routes/legacy-redirect.tsx', { id: 'legacy-templates' }),
  route('templates/:rest/*', 'routes/legacy-redirect.tsx', { id: 'legacy-template' }),
  route('weight', 'routes/legacy-redirect.tsx', { id: 'legacy-weight' }),
  layout('routes/_protected.tsx', [
    route('today', 'routes/today.tsx'),
    //
    route('body', 'routes/body.tsx'),
    route('exercises', 'routes/exercises.tsx'),
    route('exercises/:exerciseId/history', 'routes/exercises.$exerciseId.history.tsx'),
    route('history', 'routes/history.tsx'),
    route('plans', 'routes/plans.tsx'),
    route('plans/:planId', 'routes/plans.$planId.tsx'),
    route('plans/import/:shareToken', 'routes/plans.import.$shareToken.tsx'),
    route('settings', 'routes/settings.tsx'),
    route('settings/export', 'routes/settings.export.tsx'),
    route('workouts', 'routes/workouts.tsx'),
    route('workouts/:workoutId', 'routes/workouts.$workoutId.tsx'),
    //
    layout('routes/_admin.tsx', [
      route('admin', 'routes/admin.tsx'),
      route('admin/users', 'routes/admin.users.tsx'),
      route('admin/users/:userId', 'routes/admin.users.$userId.tsx'),
    ]),
  ]),
] satisfies RouteConfig;
