import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { SignIn } from './pages/SignIn';
import { AuthCallback } from './pages/AuthCallback';
import { WorkspacePicker } from './pages/WorkspacePicker';
import { WorkspaceLayout } from './pages/WorkspaceLayout';
import { ImportWorkbook } from './pages/ImportWorkbook';
import { Records } from './pages/Records';
import { RecordDetail } from './pages/RecordDetail';
import { ContractPage } from './pages/ContractPage';
import { AuditPage } from './pages/AuditPage';
import { Members } from './pages/Members';
import { OperatorLayout } from './pages/operator/OperatorLayout';
import { OperatorWorkspaces } from './pages/operator/OperatorWorkspaces';
import { OperatorWorkspaceDetail } from './pages/operator/OperatorWorkspaceDetail';

/**
 * The Book is the workspace's home at every stage (setup and live are the
 * same room). Old doors - start, interview, workbook, inbox - still resolve.
 */
function ToBook() {
  const { workspaceId = '' } = useParams();
  return <Navigate to={`/w/${workspaceId}/records`} replace />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const router = createBrowserRouter([
  { path: '/signin', element: <SignIn /> },
  // OAuth and magic-link redirects land here; no auth guard, the session is
  // being established by this very page.
  { path: '/auth/callback', element: <AuthCallback /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <WorkspacePicker /> },
      {
        // Serenica-internal, its own shell; gated on the /api/me flag inside.
        path: '/operator',
        element: <OperatorLayout />,
        children: [
          { index: true, element: <OperatorWorkspaces /> },
          { path: 'workspaces/:workspaceId', element: <OperatorWorkspaceDetail /> },
        ],
      },
      {
        path: '/w/:workspaceId',
        element: <WorkspaceLayout />,
        children: [
          { index: true, element: <Navigate to="records" replace /> },
          { path: 'records', element: <Records /> },
          { path: 'records/:recordId', element: <RecordDetail /> },
          { path: 'import', element: <ImportWorkbook /> },
          { path: 'contract', element: <ContractPage /> },
          { path: 'audit', element: <AuditPage /> },
          { path: 'members', element: <Members /> },
          // Dissolved pages; their jobs live in the Book now.
          { path: 'start', element: <ToBook /> },
          { path: 'interview', element: <ToBook /> },
          { path: 'workbook', element: <ToBook /> },
          { path: 'inbox', element: <ToBook /> },
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
