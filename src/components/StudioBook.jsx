import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { distinctChaptersByNumber, fetchChapterMetadataPages } from "../lib/chapterQueries.js";
import BookImport from "./BookImport.jsx";
import ChapterForm from "./ChapterForm.jsx";

export default function StudioBook({ novelId, mode = "chapters" }) {
  const navigate = useNavigate();
  const [novel, setNovel] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [error, setError] = useState("");
  const base = `/admin/studio/books/${novelId}`;
  const load = useCallback(async () => {
    const [novelResult, chapterResult] = await Promise.all([
      supabase.from("novels").select("id,title,author,cover_url").eq("id", novelId).single(),
      fetchChapterMetadataPages(supabase, (query) => query.eq("novel_id", novelId)),
    ]);
    if (novelResult.error) { setError(novelResult.error.message); return; }
    setNovel(novelResult.data); setChapters(distinctChaptersByNumber(chapterResult));
  }, [novelId]);
  useEffect(() => { load(); }, [load]);
  if (error) return <div className="studio-books__message error" role="alert">{error}</div>;
  if (!novel) return <div className="studio-books__message">Loading novel…</div>;
  if (mode === "import") return <BookImport novel={novel} currentChapters={chapters} onComplete={load} onCancel={() => navigate(base)} />;
  if (mode === "add") return <section className="studio-book"><header><div><h2>Add Chapter</h2><p>{novel.title}</p></div><button className="secondary" onClick={() => navigate(base)}>Back to novel</button></header><ChapterForm fixedNovelId={novel.id} onSaved={() => navigate(base)} onCancel={() => navigate(base)} /></section>;
  return <section className="studio-book"><header><div><h2>{novel.title}</h2><p>{novel.author || "Unknown author"} · {chapters.length} chapters</p></div><div><button onClick={() => navigate(`${base}/add-chapter`)}>Add Chapter</button><button onClick={() => navigate(`${base}/import-chapters`)}>Import Chapters</button></div></header><div className="studio-book__chapters">{chapters.map((chapter) => <article key={chapter.id}><strong>Chapter {chapter.number}</strong><span>{chapter.title}</span></article>)}{!chapters.length && <p>No chapters yet.</p>}</div></section>;
}
