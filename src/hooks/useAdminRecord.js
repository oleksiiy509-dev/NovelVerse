import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

export function useAdminRecord(table, id) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const mounted = useRef(true);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setState({ data: null, error: "", loading: true });
    try {
      const { data, error } = await supabase.from(table).select("*").eq("id", id).single();
      if (!mounted.current || currentRequest !== requestId.current) return;
      setState(error
        ? { data: null, error: error.message || "Не вдалося завантажити запис.", loading: false }
        : { data, error: "", loading: false });
    } catch (error) {
      if (mounted.current && currentRequest === requestId.current) setState({ data: null, error: error.message || "Не вдалося завантажити запис.", loading: false });
    }
  }, [id, table]);

  useEffect(() => {
    mounted.current = true;
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      mounted.current = false;
      requestId.current += 1;
    };
  }, [load]);

  return { ...state, retry: load };
}
