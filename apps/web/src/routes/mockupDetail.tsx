import { createRoute } from '@tanstack/react-router';

import { MockupDetailPage as MockupDetailView } from '../components/MockupLab';
import { Route as RootRoute } from './__root';

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/mockup/$mockupId',
  component: MockupDetailRoutePage,
});

function MockupDetailRoutePage() {
  const { mockupId } = Route.useParams();

  return <MockupDetailView mockupId={mockupId} />;
}