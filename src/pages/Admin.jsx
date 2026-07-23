import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { generateTtsPreview, getTtsHealth, ttsErrorMessage } from "../lib/chapterAudio";
import { optionalCount } from "../lib/adminContent";
import "../styles/AdminPanel.css";

function Admin() {
  const navigate = useNavigate();
  const [novels, setNovels] = useState([]);
  const [chapters, setChapters] = useState(0);
  const [comments, setComments] = useState({ count: 0, available: true });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [ttsHealth, setTtsHealth] = useState(null);
  const [ttsText, setTtsText] = useState("This is a short NovelVerse voice preview.");
  const [ttsVoice, setTtsVoice] = useState("alloy");
  const [ttsPreview, setTtsPreview] = useState(null);
  const [ttsError, setTtsError] = useState("");
  const [ttsLoading, setTtsLoading] = useState(false);

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
    getTtsHealth(true).then(setTtsHealth).catch((error) => setTtsError(ttsErrorMessage(error)));
  }, []);

  const statCards = useMemo(() => [
    ["Total novels", novels.length],
    ["Total chapters", chapters],
    ["Published novels", novels.filter((novel) => novel.status !== "Draft").length],
    ["Draft novels", novels.filter((novel) => novel.status === "Draft").length],
    [comments.available ? "Pending comments" : "Pending comments unavailable", comments.count],
  ], [novels, chapters, comments]);
  const activity = novels.slice(0, 6).map((novel) => ({ id: novel.id, text: `${novel.title} ready for review`, at: novel.created_at }));

  async function generatePreview() {
    setTtsLoading(true);
    setTtsError("");
    setTtsPreview(null);
    try {
      const result = await generateTtsPreview({ text: ttsText.slice(0, 250), voice: ttsVoice });
      setTtsPreview(result.audio);
    } catch (error) {
      setTtsError(ttsErrorMessage(error));
    } finally {
      setTtsLoading(false);
    }
  }

  const needsWork = novels.filter((novel) => !novel.image || Number(novel.chapters || 0) === 0).slice(0, 8);

  return <main className="admin-shell"><div className="admin-header"><div><h1>⚙️ Admin Dashboard</h1><p className="admin-muted">Operations overview for managing NovelVerse content.</p></div><div className="admin-actions"><button onClick={() => navigate("/admin/novels/add")}>➕ Add novel</button><button className="admin-secondary" onClick={() => navigate("/")}>View site</button></div></div>{toast && <p className="admin-toast">{toast}</p>}{loading && <p className="loading-state">Loading admin statistics...</p>}<section className="admin-stats-row">{statCards.map(([label, value]) => <article className="admin-stat admin-stat--compact" key={label}><strong>{Number(value || 0).toLocaleString()}</strong><span>{label}</span></article>)}</section><section className="admin-grid"><article className="admin-stat"><h2>Recent admin activity</h2>{activity.length ? activity.map((item) => <p key={item.id} className="admin-muted">• {item.text} {item.at ? new Date(item.at).toLocaleString() : ""}</p>) : <p className="empty-state">No recent activity found.</p>}</article><article className="admin-stat"><h2>Needs attention</h2>{needsWork.length ? needsWork.map((novel) => <p key={novel.id}><button className="admin-link" onClick={() => navigate(`/admin/novels/edit/${novel.id}`)}>{novel.title}</button> <span className="admin-muted">{!novel.image ? "missing cover" : ""} {Number(novel.chapters || 0) === 0 ? "missing chapters" : ""}</span></p>) : <p className="empty-state">All novels have covers and chapter counts.</p>}</article><article className="admin-stat"><h2>Quick actions</h2><div className="admin-actions"><button onClick={() => navigate("/admin/novels")}>Manage novels</button><button onClick={() => navigate("/admin/chapters")}>Manage chapters</button><button onClick={() => navigate("/admin/taxonomy")}>Manage genres</button><button onClick={() => navigate("/admin/ai-brain")}>AI Brain Studio</button><button onClick={() => navigate("/admin/voice-studio")}>Universal Voice Studio</button><button onClick={() => navigate("/admin/scene-studio")}>Scene Studio</button><button onClick={() => navigate("/admin/audio-studio")}>AI Audio Studio</button></div></article><article className="admin-stat admin-tts-panel"><h2>TTS Test</h2><p className="admin-muted">Server-side production preview. Provider credentials stay server-side.</p><p><strong>Status:</strong> {ttsHealth?.status || "unknown"}</p><p><strong>Provider:</strong> {ttsHealth?.provider || "—"} · <strong>Model:</strong> {ttsHealth?.model || "—"}</p><label>Voice<select value={ttsVoice} onChange={(event) => setTtsVoice(event.target.value)}><option value="alloy">alloy</option><option value="ash">ash</option><option value="coral">coral</option><option value="echo">echo</option><option value="nova">nova</option><option value="onyx">onyx</option><option value="shimmer">shimmer</option></select></label><label>Preview text<textarea value={ttsText} maxLength={250} onChange={(event) => setTtsText(event.target.value)} /></label><p className="admin-muted">{ttsText.length}/250 characters</p><div className="admin-actions"><button onClick={generatePreview} disabled={ttsLoading || !ttsText.trim()}>{ttsLoading ? "Generating..." : "Generate test preview"}</button><button className="admin-secondary" onClick={() => { setTtsPreview(null); setTtsError(""); }}>Clear preview</button></div>{ttsError && <p className="admin-toast">{ttsError}</p>}{ttsPreview?.signed_url && <audio controls src={ttsPreview.signed_url} />}</article></section></main>;
}
export default Admin;
