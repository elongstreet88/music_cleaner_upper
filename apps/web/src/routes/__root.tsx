import { Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <main className="min-h-screen bg-base-200 text-base-content">
      <Outlet />
    </main>
  );
}