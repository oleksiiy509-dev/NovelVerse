import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getCurrentUser, readObject, userKey } from "../lib/userFeatures";

function ContinueReading() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const user = await getCurrentUser(supabase);
      const progress = Object.values(readObject(userKey(user?.id, "readingProgress"))).sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)).slice(0, 4);
      if (!progress.length) {
        const history = JSON.parse(localStorage.getItem(userKey(user?.id, "history")) || "[]").slice(0, 4);
        if (active) setItems(history.map((entry) => ({ ...entry, progress: 0 })));
        setLoading(false);
        return;
      }
      const novelIds = [...new Set(progress.map((entry) => entry.novel_id).filter(Boolean))];
      const chapterIds = [...new Set(progress.map((entry) => entry.chapter_id).filter(Boolean))];
      const [{ data: novels = [] }, { data: chapters = [] }] = await Promise.all([
        supabase.from("novels").select("id,title,image,author").in("id", novelIds),
        supabase.from("chapters").select("id,title,number").in("id", chapterIds),
      ]);
      const novelsById = new Map(novels.map((novel) => [novel.id, novel]));
      const chaptersById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
      if (active) setItems(progress.map((entry) => ({ ...entry, novel: novelsById.get(entry.novel_id), chapter: chaptersById.get(entry.chapter_id) })));
      setLoading(false);
    }
    load().catch(() => setLoading(false));
    return () => { active = false; };
  }, []);

  const visibleItems = useMemo(() => items.filter((item) => item.chapter_id), [items]);

  return (
    <section className="home__section continue-reading" aria-labelledby="continue-reading-title">
      <div className="home__section-heading"><div><p className="home__eyebrow">Pick up where you left off</p><h2 id="continue-reading-title">Продовжити читання</h2></div></div>
      {loading && <div className="continue-reading__grid">{Array.from({ length: 3 }).map((_, index) => <div className="skeleton continue-reading__skeleton" key={index} />)}</div>}
      {!loading && !visibleItems.length && <div className="empty-state"><h3>Історія читання порожня</h3><p>Відкрийте будь-яку главу — прогрес зʼявиться тут автоматично.</p></div>}
      {!loading && !!visibleItems.length && <div className="continue-reading__grid">{visibleItems.map((item) => <article className="continue-reading__card" key={`${item.novel_id}-${item.chapter_id}`}><img src={item.novel?.image || "/favicon.svg"} alt="" /><div><h3>{item.novel?.title || `Новела ${item.novel_id}`}</h3><p>{item.chapter?.title || item.chapter_title || "Поточна глава"}</p><div className="continue-reading__progress"><span style={{ width: `${Math.max(0, Math.min(100, item.progress || 0))}%` }} /></div><button onClick={() => navigate(`/reader/${item.chapter_id}`)}>Продовжити</button></div></article>)}</div>}
    </section>
  );
}

export default ContinueReading;
