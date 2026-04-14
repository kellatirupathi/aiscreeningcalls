import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthStore } from "@/stores/authStore";

type ProtectedRoutesProps = {
  withLayout?: boolean;
};

export function ProtectedRoutes({ withLayout = true }: ProtectedRoutesProps) {
  const token = useAuthStore((state) => state.token);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isReady = useAuthStore((state) => state.isReady);
  const setReady = useAuthStore((state) => state.setReady);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const { data, isError, isLoading } = useCurrentUser();

  useEffect(() => {
    if (!token) {
      setReady(true);
    }
  }, [token, setReady]);

  useEffect(() => {
    if (data) {
      setSession(data);
    }
  }, [data, setSession]);

  useEffect(() => {
    if (token && isError) {
      clearSession();
    }
  }, [token, isError, clearSession]);

  const shouldWaitForSession = token ? !isReady || isLoading : !isReady;

  if (shouldWaitForSession) {
    return <div className="auth-shell">Authenticating session...</div>;
  }

  if (!token || !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return withLayout ? <AppLayout /> : <Outlet />;
}
