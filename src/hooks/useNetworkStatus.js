import { useEffect, useState } from "react";
import { getCurrentUser } from "../lib/userFeatures";
import { getQueuedProgress, removeQueuedProgress } from "../lib/offlineStorage";
import { supabase } from "../lib/supabase";

function isNewer(localItem, remoteItem) {
  if (!remoteItem?.updated_at) return true;
  return new Date(localItem.updated_at || 0).getTime() >= new Date(remoteItem.updated_at).getTime();
}

export function useNetworkStatus() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let messageTimer;
    async function syncQueue() {
      const user = await getCurrentUser(supabase);
      if (!user) return;
      const queued = await getQueuedProgress().catch(() => []);
      for (const item of queued) {
        const { queue_id, ...record } = item;
        const { data: remote } = await supabase.from("reading_progress").select("updated_at").eq("user_id", user.id).eq("novel_id", record.novel_id).maybeSingle();
        if (!isNewer(record, remote)) { await removeQueuedProgress(queue_id).catch(() => null); continue; }
        const { error } = await supabase.from("reading_progress").upsert({ ...record, user_id: user.id }, { onConflict: "user_id,novel_id" });
        if (!error) await removeQueuedProgress(queue_id).catch(() => null);
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
    if (online) syncQueue();
    return () => { clearTimeout(messageTimer); window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, [online]);

  return { online, message };
}
