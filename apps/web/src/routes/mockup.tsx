import { createRoute } from '@tanstack/react-router';

import { MockupLandingPage } from '../components/MockupLab';
import { Route as RootRoute } from './__root';

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/mockup',
  component: MockupLandingPage,
});
