import { createRouter } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';

import { Route as RootRoute } from './routes/__root';
import { Route as IndexRoute } from './routes/index';

export const queryClient = new QueryClient();

const routeTree = RootRoute.addChildren([IndexRoute]);

export const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}