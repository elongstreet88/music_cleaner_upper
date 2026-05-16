import { createRouter } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';

import { Route as RootRoute } from './routes/__root';
import { Route as IndexRoute } from './routes/index';
import { Route as MockupIndexRoute } from './routes/mockup';
import { Route as MockupDetailRoute } from './routes/mockupDetail';

export const queryClient = new QueryClient();

const routeTree = RootRoute.addChildren([IndexRoute, MockupIndexRoute, MockupDetailRoute]);

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