import { useEffect, useState } from "react";
import SceneStudio from "../components/SceneStudio";
import { supabase } from "../lib/supabase";
import "../styles/AdminPanel.css";

export default function AdminSceneStudio() {
  const [chapters, setChapters] = useState([]);
  const [chapterId, setChapterId] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    supabase.from("chapters").select("id, title, number, content, novel_id, novels(title)").order("created_at", { ascending: false }).limit(25).then(({ data, error }) => {
      if (error) setToast(error.message);
      const rows = data || [];
      setChapters(rows);
      setChapterId(String(rows[0]?.id || ""));
    });
  }, []);

  const chapter = chapters.find((item) => String(item.id) === String(chapterId));

  return <main className="admin-shell"><div className="admin-header"><div><h1>🎬 Cinematic Scene Engine</h1><p className="admin-muted">Transform chapters into cinematic audio scenes with ambience, effects, emotional mixing and volume automation.</p></div></div>{toast && <p className="admin-toast">{toast}</p>}<section className="admin-stat"><label>Chapter<select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>{chapters.map((item) => <option key={item.id} value={item.id}>{item.novels?.title || "Novel"} · Ch. {item.number}: {item.title}</option>)}</select></label></section>{chapter ? <SceneStudio chapter={chapter} /> : <p className="empty-state">No chapters available for cinematic scene preview.</p>}</main>;
}
