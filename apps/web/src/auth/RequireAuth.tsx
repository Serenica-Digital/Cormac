import { Navigate, Outlet } from 'react-router';
import { useSession } from './useSession';

export function RequireAuth() {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <span className="font-display text-2xl text-stone-400">Cormac</span>
      </div>
    );
  }
  if (!session) return <Navigate to="/signin" replace />;
  return <Outlet />;
}
