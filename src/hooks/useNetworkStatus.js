import { useEffect, useState } from "react";
import { getCurrentUser } from "../lib/userFeatures";
import { getQueuedProgress, removeQueuedProgress } from "../lib/offlineStorage";
import { supabase } from "../lib/supabase";

export function useNetworkStatus() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function syncQueue() {
      const user = await getCurrentUser(supabase);
      if (!user) return;
      const queued = await getQueuedProgress().catch(() => []);
      for (const item of queued) {
        const { queue_id, ...record } = item;
        const { error } = await supabase.from("reading_progress").upsert({ ...record, user_id: user.id }, { onConflict: "user_id,novel_id" });
        if (!error) await removeQueuedProgress(queue_id).catch(() => null);
      }
    }
    function handleOnline() {
      setOnline(true);
      setMessage("З’єднання відновлено. Синхронізуємо прогрес…");
      syncQueue();
      setTimeout(() => setMessage(""), 3500);
    }
    function handleOffline() {
      setOnline(false);
      setMessage("Ви офлайн. Доступні завантажені глави.");
      setTimeout(() => setMessage(""), 3500);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (online) syncQueue();
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, [online]);

  return { online, message };
}
