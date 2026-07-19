import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { addReadingHistory, getOfflineChapter, getCurrentUser, saveOfflineChapter, syncReadingProgress, userKey, readList, writeList } from "../lib/userFeatures";
import "../styles/Reader.css";

const defaultSettings = { fontSize: 20, lineHeight: 1.9, textWidth: 760, theme: "dark" };
const readerPanelKey = "readerSettingsPanelOpen";

function getReaderSettings() {
  const legacyDark = localStorage.getItem("readerDarkMode");
  const saved = JSON.parse(localStorage.getItem("readerSettings") || "null");
  return {
    ...defaultSettings,
    fontSize: Number(localStorage.getItem("readerFontSize")) || saved?.fontSize || defaultSettings.fontSize,
    lineHeight: saved?.lineHeight || defaultSettings.lineHeight,
    textWidth: saved?.textWidth || defaultSettings.textWidth,
    theme: saved?.theme || (legacyDark === "false" ? "light" : defaultSettings.theme),
  };
}

function getReaderPanelOpen() {
  return localStorage.getItem(readerPanelKey) === "true";
}

function Reader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState(null);
  const [user, setUser] = useState(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [settings, setSettings] = useState(getReaderSettings);
  const [settingsOpen, setSettingsOpen] = useState(getReaderPanelOpen);
  const [ttsActive, setTtsActive] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [tapStart, setTapStart] = useState(null);

  useEffect(() => { loadChapter(); }, [id]);

  useEffect(() => {
    localStorage.setItem("readerSettings", JSON.stringify(settings));
    localStorage.setItem("readerFontSize", settings.fontSize);
    localStorage.setItem("readerDarkMode", settings.theme === "dark");
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(readerPanelKey, settingsOpen);
  }, [settingsOpen]);

  useEffect(() => {
    if (!chapter) return;
    const saved = localStorage.getItem(`scroll_${id}`);
    setTimeout(() => window.scrollTo(0, saved ? Number(saved) : 0), 100);
  }, [chapter, id]);

  useEffect(() => {
    function saveScroll() {
      const progress = Math.min(100, Math.round((window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight)) * 100));
      localStorage.setItem(`scroll_${id}`, window.scrollY);
      if (chapter) syncReadingProgress(supabase, user, { novel_id: chapter.novel_id, chapter_id: chapter.id, scroll_y: window.scrollY, progress });
    }
    window.addEventListener("scroll", saveScroll);
    return () => window.removeEventListener("scroll", saveScroll);
  }, [id, chapter, user]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  async function loadChapter() {
    setLoading(true);
    setErrorMessage("");
    const currentUser = await getCurrentUser(supabase);
    setUser(currentUser);
    const { data, error } = await supabase.from("chapters").select("*").eq("id", id).single();
    const cached = getOfflineChapter(id);

    if (error && !cached) {
      console.error(error);
      setErrorMessage(error.message || "Глава недоступна. Спробуйте пізніше або перевірте офлайн-кеш.");
      setLoading(false);
      return;
    }

    const activeChapter = data || cached;
    setChapter(activeChapter);
    setOfflineReady(!!cached);
    const bookmarks = readList(userKey(currentUser?.id, "bookmarks"));
    setBookmarked(bookmarks.some((item) => item.chapter_id === activeChapter.id));
    if (data) saveOfflineChapter(data);
    localStorage.setItem(`lastChapter_${activeChapter.novel_id}`, activeChapter.id);

    const readKey = `readChapters_${activeChapter.novel_id}`;
    const read = JSON.parse(localStorage.getItem(readKey) || "[]");
    if (!read.includes(activeChapter.id)) localStorage.setItem(readKey, JSON.stringify([...read, activeChapter.id]));

    await addReadingHistory(supabase, currentUser, { novel_id: activeChapter.novel_id, chapter_id: activeChapter.id, chapter_title: activeChapter.title });
    setLoading(false);
  }

  async function previousChapter() {
    if (!chapter) return;
    const { data } = await supabase.from("chapters").select("id").eq("novel_id", chapter.novel_id).lt("number", chapter.number).order("number", { ascending: false }).limit(1).maybeSingle();
    if (data) navigate(`/reader/${data.id}`);
  }

  async function nextChapter() {
    if (!chapter) return;
    const { data } = await supabase.from("chapters").select("id").eq("novel_id", chapter.novel_id).gt("number", chapter.number).order("number", { ascending: true }).limit(1).maybeSingle();
    if (data) navigate(`/reader/${data.id}`);
  }

  async function toggleBookmark() {
    if (!chapter) return;
    const key = userKey(user?.id, "bookmarks");
    const bookmarks = readList(key);
    if (bookmarked) {
      writeList(key, bookmarks.filter((item) => item.chapter_id !== chapter.id));
      setBookmarked(false);
      if (user) await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("chapter_id", chapter.id);
      return;
    }
    const entry = { novel_id: chapter.novel_id, chapter_id: chapter.id, chapter_title: chapter.title, scroll_y: window.scrollY, created_at: new Date().toISOString() };
    writeList(key, [entry, ...bookmarks]);
    setBookmarked(true);
    if (user) await supabase.from("bookmarks").insert({ ...entry, user_id: user.id });
  }

  function cacheCurrentChapter() {
    saveOfflineChapter(chapter);
    setOfflineReady(true);
    alert("Главу збережено для офлайн-читання.");
  }

  function handleReadingPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    setTapStart({ x: e.clientX, y: e.clientY });
  }

  function handleReadingPointerUp(e) {
    if (!tapStart) return;
    const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
    setTapStart(null);
    if (moved > 10 || e.target.closest("button, a, input, select, textarea, label, [role=button]")) return;
    setControlsVisible((visible) => !visible);
  }

  function toggleTts() {
    if (!chapter || !window.speechSynthesis) return;
    if (ttsActive) {
      window.speechSynthesis.cancel();
      setTtsActive(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(`${chapter.title}. ${chapter.content}`);
    utterance.onend = () => setTtsActive(false);
    utterance.onerror = () => setTtsActive(false);
    window.speechSynthesis.speak(utterance);
    setTtsActive(true);
  }

  if (loading) return <main className="reader reader--dark"><div className="reader__shell"><div className="skeleton reader__skeleton" /></div></main>;
  if (errorMessage) return <main className="reader reader--dark"><div className="reader__shell"><div className="error-state">{errorMessage}</div></div></main>;

  return (
    <main className={`reader reader--${settings.theme} ${controlsVisible ? "reader--controls-visible" : "reader--immersive"}`}>
      <button className="reader__settings-toggle" onClick={() => setSettingsOpen(true)} aria-expanded={settingsOpen} aria-controls="reader-settings-panel">⚙️<span>Налаштування</span></button>
      <div className="reader__controls reader__controls--top" aria-hidden={!controlsVisible}>
        <div className="reader__controls-inner" style={{ maxWidth: `${settings.textWidth}px` }}>
          <button className="reader__back" onClick={() => navigate(`/novel/${chapter.novel_id}`)}>⬅ До списку глав</button>
          <header className="reader__header">
            <span>Глава {chapter.number}</span>
            <h1>{chapter.title}</h1>
          </header>
        </div>
      </div>
      <div className="reader__shell" style={{ maxWidth: `${settings.textWidth}px` }}>
        <article
          className="reader__content"
          style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}
          onPointerDown={handleReadingPointerDown}
          onPointerUp={handleReadingPointerUp}
        >{chapter.content}</article>
      </div>
      <nav className="reader__controls reader__controls--bottom reader__chapter-nav" aria-hidden={!controlsVisible}>
        <div className="reader__controls-inner" style={{ maxWidth: `${settings.textWidth}px` }}>
          <button onClick={previousChapter}>⬅ Попередня</button><button onClick={nextChapter}>Наступна ➡</button>
        </div>
      </nav>
      {settingsOpen && <div className="reader__settings-scrim" onClick={() => setSettingsOpen(false)} />}
      <section id="reader-settings-panel" className={`reader__settings ${settingsOpen ? "reader__settings--open" : ""}`} aria-label="Налаштування читання" aria-hidden={!settingsOpen}>
        <div className="reader__settings-header"><h2>Налаштування</h2><button onClick={() => setSettingsOpen(false)} aria-label="Закрити налаштування">✕</button></div>
        <label>Розмір <input type="range" min="16" max="30" value={settings.fontSize} onChange={(e) => setSettings({ ...settings, fontSize: Number(e.target.value) })} /></label>
        <label>Інтервал <input type="range" min="1.5" max="2.4" step="0.1" value={settings.lineHeight} onChange={(e) => setSettings({ ...settings, lineHeight: Number(e.target.value) })} /></label>
        <label>Ширина <input type="range" min="560" max="960" step="20" value={settings.textWidth} onChange={(e) => setSettings({ ...settings, textWidth: Number(e.target.value) })} /></label>
        <select value={settings.theme} onChange={(e) => setSettings({ ...settings, theme: e.target.value })} aria-label="Тема читання">
          <option value="light">Світла</option><option value="dark">Темна</option><option value="sepia">Sepia</option>
        </select>
        <button onClick={toggleBookmark}>{bookmarked ? "🔖 Додано" : "🔖 Закладка"}</button>
        <button onClick={cacheCurrentChapter}>{offlineReady ? "✅ Офлайн" : "⬇️ Офлайн"}</button>
        <button onClick={toggleTts} disabled={!window.speechSynthesis}>{ttsActive ? "⏹️ Зупинити TTS" : "🔊 TTS"}</button>
      </section>
    </main>
  );
}

export default Reader;
