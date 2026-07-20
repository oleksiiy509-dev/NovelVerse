import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { optionalCount } from "../lib/adminContent";
import "../styles/AdminPanel.css";

function Admin() {
  const navigate = useNavigate();
  const [novels, setNovels] = useState([]);
  const [chapters, setChapters] = useState(0);
  const [comments, setComments] = useState({ count: 0, available: true });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      const [{ data, error }, chapterResult, commentResult] = await Promise.all([
        supabase.from("novels").select("*").order("id", { ascending: false }),
        optionalCount("chapters"),
        optionalCount("comments", (query) => query.or("status.eq.pending,approved.eq.false")),
      ]);
      if (error) setToast(error.message); else setNovels(data || []);
      setChapters(chapterResult.count);
      setComments(commentResult);
      setLoading(false);
    }
    loadStats();
  }, []);

  const statCards = useMemo(() => [
    ["Total novels", novels.length],
    ["Total chapters", chapters],
    ["Published novels", novels.filter((novel) => novel.status !== "Draft").length],
    ["Draft novels", novels.filter((novel) => novel.status === "Draft").length],
    [comments.available ? "Pending comments" : "Pending comments unavailable", comments.count],
  ], [novels, chapters, comments]);
  const activity = novels.slice(0, 6).map((novel) => ({ id: novel.id, text: `${novel.title} ready for review`, at: novel.created_at }));
  const needsWork = novels.filter((novel) => !novel.image || Number(novel.chapters || 0) === 0).slice(0, 8);

  return <main className="admin-shell"><div className="admin-header"><div><h1>⚙️ Admin Dashboard</h1><p className="admin-muted">Operations overview for managing NovelVerse content.</p></div><div className="admin-actions"><button onClick={() => navigate("/admin/novels/add")}>➕ Add novel</button><button className="admin-secondary" onClick={() => navigate("/")}>View site</button></div></div>{toast && <p className="admin-toast">{toast}</p>}{loading && <p className="loading-state">Loading admin statistics...</p>}<section className="admin-stats-row">{statCards.map(([label, value]) => <article className="admin-stat admin-stat--compact" key={label}><strong>{Number(value || 0).toLocaleString()}</strong><span>{label}</span></article>)}</section><section className="admin-grid"><article className="admin-stat"><h2>Recent admin activity</h2>{activity.length ? activity.map((item) => <p key={item.id} className="admin-muted">• {item.text} {item.at ? new Date(item.at).toLocaleString() : ""}</p>) : <p className="empty-state">No recent activity found.</p>}</article><article className="admin-stat"><h2>Needs attention</h2>{needsWork.length ? needsWork.map((novel) => <p key={novel.id}><button className="admin-link" onClick={() => navigate(`/admin/novels/edit/${novel.id}`)}>{novel.title}</button> <span className="admin-muted">{!novel.image ? "missing cover" : ""} {Number(novel.chapters || 0) === 0 ? "missing chapters" : ""}</span></p>) : <p className="empty-state">All novels have covers and chapter counts.</p>}</article><article className="admin-stat"><h2>Quick actions</h2><div className="admin-actions"><button onClick={() => navigate("/admin/novels")}>Manage novels</button><button onClick={() => navigate("/admin/chapters")}>Manage chapters</button><button onClick={() => navigate("/admin/taxonomy")}>Manage genres</button></div></article></section></main>;
}
export default Admin;
