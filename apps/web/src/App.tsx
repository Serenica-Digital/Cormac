import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { SignIn } from './pages/SignIn';
import { WorkspacePicker } from './pages/WorkspacePicker';
import { WorkspaceLayout } from './pages/WorkspaceLayout';
import { Interview } from './pages/Interview';
import { Workbook } from './pages/Workbook';
import { Inbox } from './pages/Inbox';
import { Records } from './pages/Records';
import { RecordDetail } from './pages/RecordDetail';
import { ContractPage } from './pages/ContractPage';
import { AuditPage } from './pages/AuditPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const router = createBrowserRouter([
  { path: '/signin', element: <SignIn /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <WorkspacePicker /> },
      {
        path: '/w/:workspaceId',
        element: <WorkspaceLayout />,
        children: [
          { index: true, element: <Navigate to="inbox" replace /> },
          { path: 'interview', element: <Interview /> },
          { path: 'workbook', element: <Workbook /> },
          { path: 'inbox', element: <Inbox /> },
          { path: 'records', element: <Records /> },
          { path: 'records/:recordId', element: <RecordDetail /> },
          { path: 'contract', element: <ContractPage /> },
          { path: 'audit', element: <AuditPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
