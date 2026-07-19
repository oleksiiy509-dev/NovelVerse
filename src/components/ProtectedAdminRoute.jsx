import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { requireAdmin } from "../lib/admin";

function ProtectedAdminRoute() {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, allowed: false });

  useEffect(() => {
    let mounted = true;
    requireAdmin(supabase).then(({ allowed }) => {
      if (mounted) setState({ loading: false, allowed });
    });
    return () => { mounted = false; };
  }, []);

  if (state.loading) return <div className="page-shell loading-state">Перевіряємо права адміністратора...</div>;
  if (!state.allowed) return <Navigate to="/login?admin=1" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export default ProtectedAdminRoute;
