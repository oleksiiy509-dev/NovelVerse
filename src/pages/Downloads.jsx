import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import defaultCover from "../assets/default-cover.svg";
import { clearDownloads, deleteDownloadedNovel, estimateStorageUsage, formatBytes, getDownloadedNovels } from "../lib/offlineStorage";
import "./Downloads.css";

function formatDate(value) {
  if (!value) return "невідомо";
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Downloads() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [usage, setUsage] = useState({ used: 0, quota: 0, offlineBytes: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const totalSize = useMemo(() => items.reduce((sum, item) => sum + item.size, 0), [items]);

  const load = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [novels, storage] = await Promise.all([getDownloadedNovels(), estimateStorageUsage()]);
      setItems(novels);
      setUsage(storage);
    } catch {
      setError("Не вдалося відкрити офлайн-сховище.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitialDownloads() {
      const [novels, storage] = await Promise.all([getDownloadedNovels(), estimateStorageUsage()]);
      if (!active) return;
      setItems(novels);
      setUsage(storage);
      setLoading(false);
    }

    loadInitialDownloads().catch(() => { if (active) { setError("Не вдалося відкрити офлайн-сховище."); setLoading(false); } });
    return () => { active = false; };
  }, []);

  async function removeNovel(item) {
    if (busyId || !window.confirm(`Видалити офлайн-копію «${item.title}»?`)) return;
    setBusyId(item.novel_id);
    try { await deleteDownloadedNovel(item.novel_id); await load({ showLoading: false }); }
    catch { setError("Не вдалося видалити завантаження."); }
    finally { setBusyId(""); }
  }

  async function removeAll() {
    if (busyId || !window.confirm("Видалити всі завантаження NovelVerse?")) return;
    setBusyId("all");
    try { await clearDownloads(); await load({ showLoading: false }); }
    catch { setError("Не вдалося очистити завантаження."); }
    finally { setBusyId(""); }
  }

  return <main className="downloads page-shell">
    <header className="downloads__header">
      <div>
        <h1>⬇️ Завантаження</h1>
        <p>Офлайн-бібліотека займає {formatBytes(totalSize)}{usage.quota ? ` · сховище браузера ${formatBytes(usage.used)} / ${formatBytes(usage.quota)}` : ""}.</p>
      </div>
      {items.length > 0 && <button disabled={!!busyId} onClick={removeAll}>{busyId === "all" ? "Видалення…" : "Видалити все"}</button>}
    </header>
    {loading ? <div className="skeleton downloads__skeleton" aria-label="Завантаження" /> : error ? <section className="error-state" role="alert"><h2>Завантаження недоступні</h2><p>{error}</p><button type="button" onClick={() => load()}>Спробувати ще раз</button></section> : items.length === 0 ? <div className="empty-state downloads__empty"><strong>Немає завантажень</strong><span>Відкрийте сторінку новели та натисніть «Завантажити», щоб читати без інтернету.</span></div> : <section className="downloads__list">{items.map((item) => <article className="download-card" key={item.novel_id}>
      <img src={item.cover_url || defaultCover} alt="" onError={(event) => { event.currentTarget.src = defaultCover; }} />
      <div><h3>{item.title}</h3><p>{item.chapter_count} глав · {formatBytes(item.size)}</p><small>Завантажено: {formatDate(item.downloaded_at)}</small></div>
      <div className="download-card__actions"><button disabled={!item.chapters?.[0]?.chapter_id} onClick={() => navigate(`/reader/${item.chapters[0].chapter_id}`)}>{item.chapters?.[0]?.chapter_id ? "Читати офлайн" : "Немає доступних глав"}</button><button onClick={() => navigate(`/novel/${item.novel_id}`)}>До новели</button><button disabled={busyId === item.novel_id} onClick={() => removeNovel(item)}>{busyId === item.novel_id ? "Видалення…" : "Видалити"}</button></div>
    </article>)}</section>}
  </main>;
}

export default Downloads;
