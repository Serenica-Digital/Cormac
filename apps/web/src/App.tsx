import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { Spinner } from './components/kit';
import { SignIn } from './pages/SignIn';
import { AuthCallback } from './pages/AuthCallback';
import { WorkspacePicker } from './pages/WorkspacePicker';
import { WorkspaceLayout, useWorkspaceStage } from './pages/WorkspaceLayout';
import { GetStarted } from './pages/GetStarted';
import { Interview } from './pages/Interview';
import { Workbook } from './pages/Workbook';
import { ImportWorkbook } from './pages/ImportWorkbook';
import { Inbox } from './pages/Inbox';
import { Records } from './pages/Records';
import { RecordDetail } from './pages/RecordDetail';
import { ContractPage } from './pages/ContractPage';
import { AuditPage } from './pages/AuditPage';
import { Members } from './pages/Members';
import { OperatorLayout } from './pages/operator/OperatorLayout';
import { OperatorWorkspaces } from './pages/operator/OperatorWorkspaces';
import { OperatorWorkspaceDetail } from './pages/operator/OperatorWorkspaceDetail';

/** Lands on the everyday Inbox once the book is live; on setup before then. */
function WorkspaceIndex() {
  const { workspaceId = '' } = useParams();
  const stage = useWorkspaceStage(workspaceId);
  if (stage === 'pending') {
    return (
      <div className="flex justify-center py-20 text-stone-400">
        <Spinner />
      </div>
    );
  }
  return <Navigate to={stage === 'live' ? 'inbox' : 'start'} replace />;
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
          { index: true, element: <WorkspaceIndex /> },
          { path: 'start', element: <GetStarted /> },
          { path: 'interview', element: <Interview /> },
          { path: 'workbook', element: <Workbook /> },
          { path: 'inbox', element: <Inbox /> },
          { path: 'records', element: <Records /> },
          { path: 'import', element: <ImportWorkbook /> },
          { path: 'records/:recordId', element: <RecordDetail /> },
          { path: 'contract', element: <ContractPage /> },
          { path: 'audit', element: <AuditPage /> },
          { path: 'members', element: <Members /> },
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
