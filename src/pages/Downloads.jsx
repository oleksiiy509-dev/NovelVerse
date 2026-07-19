import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import defaultCover from "../assets/default-cover.svg";
import { clearDownloads, deleteDownloadedNovel, formatBytes, getDownloadedNovels } from "../lib/offlineStorage";
import "./Downloads.css";

function Downloads() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const totalSize = useMemo(() => items.reduce((sum, item) => sum + item.size, 0), [items]);

  async function load() {
    setLoading(true);
    setItems(await getDownloadedNovels().catch(() => []));
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    getDownloadedNovels().then((rows) => { if (active) setItems(rows); }).catch(() => { if (active) setItems([]); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function removeNovel(item) {
    if (!window.confirm(`Видалити офлайн-копію «${item.title}»?`)) return;
    await deleteDownloadedNovel(item.novel_id);
    load();
  }

  async function removeAll() {
    if (!window.confirm("Видалити всі завантаження NovelVerse?")) return;
    await clearDownloads();
    load();
  }

  return <main className="downloads page-shell">
    <header className="downloads__header"><div><h1>⬇️ Завантаження</h1><p>Офлайн-бібліотека займає {formatBytes(totalSize)}.</p></div>{items.length > 0 && <button onClick={removeAll}>Видалити все</button>}</header>
    {loading ? <div className="skeleton downloads__skeleton" /> : items.length === 0 ? <div className="empty-state">Завантажених новел поки немає.</div> : <section className="downloads__list">{items.map((item) => <article className="download-card" key={item.novel_id}>
      <img src={item.cover_url || defaultCover} alt="" onError={(event) => { event.currentTarget.src = defaultCover; }} />
      <div><h3>{item.title}</h3><p>{item.chapter_count} глав · {formatBytes(item.size)}</p></div>
      <div className="download-card__actions"><button onClick={() => navigate(`/reader/${item.chapters[0]?.chapter_id}`)}>Відкрити</button><button onClick={() => removeNovel(item)}>Видалити</button></div>
    </article>)}</section>}
  </main>;
}

export default Downloads;
