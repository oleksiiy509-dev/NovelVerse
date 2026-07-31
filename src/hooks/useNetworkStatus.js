import { useEffect, useState } from "react";
import { getCurrentUser } from "../lib/userFeatures";
import { getQueuedProgress, removeQueuedProgress } from "../lib/offlineStorage";
import { supabase } from "../lib/supabase";
import { diagnosticLogger } from "../lib/diagnosticLogger";

function isNewer(localItem, remoteItem) {
  if (!remoteItem?.updated_at) return true;
  return new Date(localItem.updated_at || 0).getTime() >= new Date(remoteItem.updated_at).getTime();
}

export function useNetworkStatus() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let messageTimer;
    let disposed = false;
    let syncing = false;
    async function syncQueue() {
      if (syncing || disposed || !navigator.onLine) return;
      syncing = true;
      try {
        const user = await getCurrentUser(supabase);
        if (!user || disposed) return;
        const queued = await getQueuedProgress();
        for (const item of queued) {
          if (disposed || !navigator.onLine) break;
          const { queue_id, ...record } = item;
          const { data: remote, error: readError, status } = await supabase.from("reading_progress").select("updated_at").eq("user_id", user.id).eq("novel_id", record.novel_id).maybeSingle();
          if (status === 404) return;
          if (readError) throw readError;
          if (!isNewer(record, remote)) { await removeQueuedProgress(queue_id); continue; }
          const { error } = await supabase.from("reading_progress").upsert({ ...record, user_id: user.id }, { onConflict: "user_id,novel_id" });
          if (error) throw error;
          await removeQueuedProgress(queue_id);
        }
      } catch (error) {
        diagnosticLogger.warn("offline-sync", "Reading progress sync was deferred", { error });
      } finally {
        syncing = false;
      }
    }
    function flash(nextOnline, nextMessage) {
      setOnline(nextOnline);
      setMessage(nextMessage);
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => setMessage(""), 3500);
    }
    function handleOnline() { flash(true, "З’єднання відновлено. Синхронізуємо прогрес…"); syncQueue(); }
    function handleOffline() { flash(false, "Ви офлайн. Доступні завантажені глави."); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (navigator.onLine) syncQueue();
    return () => { disposed = true; clearTimeout(messageTimer); window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);

  return { online, message };
}
