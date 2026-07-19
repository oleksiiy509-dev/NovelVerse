import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { addReadingHistory, getOfflineChapter, getCurrentUser, saveOfflineChapter, syncReadingProgress, userKey, readList, readCloudBackedList, writeCloudBackedList } from "../lib/userFeatures";
import { shareToTelegram, telegramCloudGetItem, telegramCloudSetItem } from "../lib/telegram";
import { useTelegramBackButton, useTelegramMainButton } from "../hooks/useTelegram";
import "../styles/Reader.css";

const defaultSettings = { fontSize: 20, lineHeight: 1.9, textWidth: 760, theme: "dark", fontFamily: "serif" };
const fontFamilies = { serif: "Georgia, \"Times New Roman\", serif", sans: "Inter, system-ui, -apple-system, sans-serif", dyslexic: "Verdana, Arial, sans-serif", mono: "\"Courier New\", monospace" };
const defaultNarrationSettings = { rate: 1, voiceURI: "" };
const readerPanelKey = "readerSettingsPanelOpen";
const narrationSettingsKey = "readerNarrationSettings";

function getReaderSettings() {
  const legacyDark = localStorage.getItem("readerDarkMode");
  const saved = JSON.parse(localStorage.getItem("readerSettings") || "null");
  return {
    ...defaultSettings,
    fontSize: Number(localStorage.getItem("readerFontSize")) || saved?.fontSize || defaultSettings.fontSize,
    lineHeight: saved?.lineHeight || defaultSettings.lineHeight,
    textWidth: saved?.textWidth || defaultSettings.textWidth,
    theme: saved?.theme || (legacyDark === "false" ? "light" : defaultSettings.theme),
    fontFamily: saved?.fontFamily || defaultSettings.fontFamily,
  };
}

function getReaderPanelOpen() {
  return localStorage.getItem(readerPanelKey) === "true";
}

function getNarrationSettings() {
  const saved = JSON.parse(localStorage.getItem(narrationSettingsKey) || "null");
  return { ...defaultNarrationSettings, ...saved, rate: Math.min(2, Math.max(0.5, Number(saved?.rate) || defaultNarrationSettings.rate)) };
}

function splitChapterIntoParagraphs(content = "") {
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}|(?<=[.!?…])\s+(?=[A-ZА-ЯІЇЄҐЁ])/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getNarrationPositionKey(chapterId) {
  return `readerNarrationPosition_${chapterId}`;
}

function getSavedNarrationPosition(chapterId) {
  return Math.max(0, Number(localStorage.getItem(getNarrationPositionKey(chapterId))) || 0);
}

function getVoiceLanguage(text = "") {
  if (/[іїєґІЇЄҐ]/.test(text)) return "uk";
  if (/[а-яёА-ЯЁ]/.test(text)) return "ru";
  return "en";
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
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
  const [narrationOpen, setNarrationOpen] = useState(false);
  const [ttsActive, setTtsActive] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [narrationSettings, setNarrationSettings] = useState(getNarrationSettings);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState(0);
  const [navigatingChapter, setNavigatingChapter] = useState(false);
  const [adjacentChapters, setAdjacentChapters] = useState({ previous: null, next: null });
  const sleepTimerRef = useRef(null);
  const [voices, setVoices] = useState([]);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(() => getSavedNarrationPosition(id));
  const [controlsVisible, setControlsVisible] = useState(true);
  const [readingProgress, setReadingProgress] = useState(0);
  const [tapStart, setTapStart] = useState(null);
  const utteranceRef = useRef(null);

  useTelegramBackButton(true, chapter ? `/novel/${chapter.novel_id}` : "/");

  useTelegramMainButton(useMemo(() => ({
    text: bookmarked ? "Remove bookmark" : "Bookmark",
    onClick: () => toggleBookmark(),
    disabled: !chapter,
  }), [bookmarked, chapter]));

  const paragraphs = useMemo(() => splitChapterIntoParagraphs(chapter?.content), [chapter?.content]);
  const narrationSupported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const estimatedTotalSeconds = useMemo(() => Math.max(1, Math.round(paragraphs.join(" ").split(/\s+/).filter(Boolean).length / (165 * narrationSettings.rate) * 60)), [paragraphs, narrationSettings.rate]);
  const elapsedSeconds = useMemo(() => Math.round((currentParagraphIndex / Math.max(1, paragraphs.length)) * estimatedTotalSeconds), [currentParagraphIndex, estimatedTotalSeconds, paragraphs.length]);

  useEffect(() => { loadChapter(); }, [id]);

  useEffect(() => {
    localStorage.setItem("readerSettings", JSON.stringify(settings));
    localStorage.setItem("readerFontSize", settings.fontSize);
    localStorage.setItem("readerDarkMode", settings.theme === "dark");
    telegramCloudSetItem("novelverse:readerSettings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(narrationSettingsKey, JSON.stringify(narrationSettings));
  }, [narrationSettings]);

  useEffect(() => {
    localStorage.setItem(readerPanelKey, settingsOpen);
  }, [settingsOpen]);

  useEffect(() => {
    if (!chapter) return;
    const saved = localStorage.getItem(`scroll_${id}`);
    const target = saved ? Number(saved) : 0;
    let attempts = 0;
    function restore() {
      window.scrollTo({ top: target, behavior: "auto" });
      attempts += 1;
      if (attempts < 8 && Math.abs(window.scrollY - target) > 2) requestAnimationFrame(restore);
    }
    requestAnimationFrame(restore);
  }, [chapter, id]);

  useEffect(() => {
    function saveScroll() {
      const progress = Math.min(100, Math.max(0, Math.round((window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight)) * 100)));
      setReadingProgress(progress);
      localStorage.setItem(`scroll_${id}`, window.scrollY);
      if (chapter) syncReadingProgress(supabase, user, { novel_id: chapter.novel_id, chapter_id: chapter.id, scroll_y: window.scrollY, progress }, telegramCloudSetItem);
    }
    saveScroll();
    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("resize", saveScroll);
    return () => { window.removeEventListener("scroll", saveScroll); window.removeEventListener("resize", saveScroll); };
  }, [id, chapter, user]);

  useEffect(() => () => {
    if (narrationSupported) window.speechSynthesis.cancel();
    clearTimeout(sleepTimerRef.current);
  }, [id, narrationSupported]);

  useEffect(() => {
    if (!narrationSupported) return undefined;
    function loadVoices() {
      setVoices(window.speechSynthesis.getVoices());
    }
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [narrationSupported]);

  useEffect(() => {
    if (!chapter) return;
    localStorage.setItem(getNarrationPositionKey(chapter.id), currentParagraphIndex);
  }, [chapter, currentParagraphIndex]);

  useEffect(() => {
    const activeParagraph = document.getElementById(`reader-paragraph-${currentParagraphIndex}`);
    if (ttsActive && activeParagraph) activeParagraph.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentParagraphIndex, ttsActive]);

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
    setCurrentParagraphIndex(getSavedNarrationPosition(activeChapter.id));
    setChapter(activeChapter);
    await loadAdjacentChapters(activeChapter);
    setOfflineReady(!!cached);
    const cloudSettings = await telegramCloudGetItem("novelverse:readerSettings");
    if (cloudSettings) {
      try { setSettings((current) => ({ ...current, ...JSON.parse(cloudSettings) })); } catch { /* keep local settings */ }
    }
    const bookmarks = await readCloudBackedList(userKey(currentUser?.id, "bookmarks"), telegramCloudGetItem);
    setBookmarked(bookmarks.some((item) => item.chapter_id === activeChapter.id));
    if (data) saveOfflineChapter(data);
    localStorage.setItem(`lastChapter_${activeChapter.novel_id}`, activeChapter.id);

    const readKey = `readChapters_${activeChapter.novel_id}`;
    const read = await readCloudBackedList(readKey, telegramCloudGetItem);
    if (!read.includes(activeChapter.id)) await writeCloudBackedList(readKey, [...read, activeChapter.id], telegramCloudSetItem);

    await addReadingHistory(supabase, currentUser, { novel_id: activeChapter.novel_id, chapter_id: activeChapter.id, chapter_title: activeChapter.title });
    setLoading(false);
  }

  async function loadAdjacentChapters(activeChapter) {
    const base = supabase.from("chapters").select("id").eq("novel_id", activeChapter.novel_id);
    const [{ data: previous }, { data: next }] = await Promise.all([
      base.lt("number", activeChapter.number).order("number", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("chapters").select("id").eq("novel_id", activeChapter.novel_id).gt("number", activeChapter.number).order("number", { ascending: true }).limit(1).maybeSingle(),
    ]);
    setAdjacentChapters({ previous, next });
  }

  async function goToAdjacentChapter(direction) {
    if (!chapter || navigatingChapter) return;
    const target = direction < 0 ? adjacentChapters.previous : adjacentChapters.next;
    if (!target) return;
    setNavigatingChapter(true);
    navigate(`/reader/${target.id}`, { preventScrollReset: true });
  }

  function previousChapter() { goToAdjacentChapter(-1); }

  function nextChapter() { goToAdjacentChapter(1); }

  async function toggleBookmark() {
    if (!chapter) return;
    const key = userKey(user?.id, "bookmarks");
    const bookmarks = readList(key);
    if (bookmarked) {
      await writeCloudBackedList(key, bookmarks.filter((item) => item.chapter_id !== chapter.id), telegramCloudSetItem);
      setBookmarked(false);
      if (user) await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("chapter_id", chapter.id);
      return;
    }
    const entry = { novel_id: chapter.novel_id, chapter_id: chapter.id, chapter_title: chapter.title, scroll_y: window.scrollY, created_at: new Date().toISOString() };
    await writeCloudBackedList(key, [entry, ...bookmarks], telegramCloudSetItem);
    setBookmarked(true);
    if (user) await supabase.from("bookmarks").insert({ ...entry, user_id: user.id });
  }

  function cacheCurrentChapter() {
    saveOfflineChapter(chapter);
    setOfflineReady(true);
    alert("Главу збережено для офлайн-читання.");
  }

  function shareChapter() {
    shareToTelegram({ title: chapter.title, text: `Глава ${chapter.number} у NovelVerse`, url: window.location.href });
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

  function getSelectedVoice() {
    return voices.find((voice) => voice.voiceURI === narrationSettings.voiceURI) || voices.find((voice) => voice.lang.toLowerCase().startsWith(getVoiceLanguage(chapter?.content))) || null;
  }

  function speakParagraph(index = currentParagraphIndex, rate = narrationSettings.rate) {
    if (!chapter || !narrationSupported || !paragraphs.length) return;
    const safeIndex = Math.min(Math.max(index, 0), paragraphs.length - 1);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(paragraphs[safeIndex]);
    utterance.lang = getSelectedVoice()?.lang || getVoiceLanguage(paragraphs[safeIndex]);
    utterance.voice = getSelectedVoice();
    utterance.rate = rate;
    utterance.onend = () => {
      if (safeIndex < paragraphs.length - 1) speakParagraph(safeIndex + 1, rate);
      else {
        setTtsActive(false);
        setTtsPaused(false);
      }
    };
    utterance.onerror = () => {
      setTtsActive(false);
      setTtsPaused(false);
    };
    utteranceRef.current = utterance;
    setCurrentParagraphIndex(safeIndex);
    setTtsActive(true);
    setTtsPaused(false);
    window.speechSynthesis.speak(utterance);
  }

  function stopNarration(savePosition = true) {
    if (narrationSupported) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setTtsActive(false);
    setTtsPaused(false);
    if (!savePosition && chapter) localStorage.setItem(getNarrationPositionKey(chapter.id), currentParagraphIndex);
  }

  function pauseNarration() {
    if (!narrationSupported) return;
    window.speechSynthesis.pause();
    setTtsPaused(true);
  }

  function resumeNarration() {
    if (!narrationSupported) return;
    window.speechSynthesis.resume();
    setTtsActive(true);
    setTtsPaused(false);
  }

  function moveParagraph(direction) {
    const target = Math.min(Math.max(currentParagraphIndex + direction, 0), Math.max(paragraphs.length - 1, 0));
    setCurrentParagraphIndex(target);
    if (ttsActive || ttsPaused) speakParagraph(target);
  }

  function restartNarration() {
    setCurrentParagraphIndex(0);
    if (narrationSupported) speakParagraph(0);
  }

  function scrubNarration(value) {
    const target = Math.min(Math.max(Number(value), 0), Math.max(paragraphs.length - 1, 0));
    setCurrentParagraphIndex(target);
    if (ttsActive || ttsPaused) speakParagraph(target);
  }

  function updateNarrationRate(rate) {
    setNarrationSettings((current) => ({ ...current, rate }));
    if (ttsActive || ttsPaused) setTimeout(() => speakParagraph(currentParagraphIndex, rate), 0);
  }

  function updateSleepTimer(minutes) {
    setSleepTimerMinutes(minutes);
    clearTimeout(sleepTimerRef.current);
    if (minutes > 0) sleepTimerRef.current = setTimeout(() => stopNarration(), minutes * 60 * 1000);
  }

  if (loading) return <main className="reader reader--dark"><div className="reader__shell"><div className="skeleton reader__skeleton" /></div></main>;
  if (errorMessage) return <main className="reader reader--dark"><div className="reader__shell"><div className="error-state">{errorMessage}</div></div></main>;

  return (
    <main className={`reader reader--${settings.theme} ${controlsVisible ? "reader--controls-visible" : "reader--immersive"}`}>
      <button className="reader__settings-toggle" onClick={() => setSettingsOpen(true)} aria-expanded={settingsOpen} aria-controls="reader-settings-panel">⚙️<span>Налаштування</span></button>
      <button className="reader__audio-toggle" onClick={() => setNarrationOpen((open) => !open)} aria-expanded={narrationOpen} aria-controls="reader-narration-panel">🔊<span>Аудіо</span></button>
      <div className="reader__reading-progress" aria-label={`Прогрес читання ${readingProgress}%`}><span style={{ width: `${readingProgress}%` }} /></div>
      <div className="reader__controls reader__controls--top" aria-hidden={!controlsVisible}>
        <div className="reader__controls-inner" style={{ maxWidth: `${settings.textWidth}px` }}>
          <button className="reader__back reader__back--compact" onClick={() => navigate(`/novel/${chapter.novel_id}`)}>← Глави</button>
          <header className="reader__header">
            <span>Глава {chapter.number}</span>
            <h1>{chapter.title}</h1>
          </header>
        </div>
      </div>
      <div className="reader__shell" style={{ maxWidth: `${settings.textWidth}px` }}>
        <article
          className="reader__content"
          style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, fontFamily: fontFamilies[settings.fontFamily] || fontFamilies.serif }}
          onPointerDown={handleReadingPointerDown}
          onPointerUp={handleReadingPointerUp}
        >
          {paragraphs.map((paragraph, index) => (
            <p id={`reader-paragraph-${index}`} className={index === currentParagraphIndex && (ttsActive || ttsPaused) ? "reader__paragraph reader__paragraph--speaking" : "reader__paragraph"} key={`${chapter.id}-${index}`}>{paragraph}</p>
          ))}
        </article>
      </div>
      <nav className="reader__controls reader__controls--bottom reader__chapter-nav" aria-label="Chapter navigation">
        <div className="reader__controls-inner" style={{ maxWidth: `${settings.textWidth}px` }}>
          <button onClick={previousChapter} disabled={navigatingChapter || !adjacentChapters.previous}>{adjacentChapters.previous ? "← Назад" : "Перша глава"}</button><button className="reader__next-chapter" onClick={nextChapter} disabled={navigatingChapter || !adjacentChapters.next}>{navigatingChapter ? "Завантаження…" : adjacentChapters.next ? "Далі →" : "Остання глава"}</button>
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
        <select value={settings.fontFamily} onChange={(e) => setSettings({ ...settings, fontFamily: e.target.value })} aria-label="Шрифт читання">
          <option value="serif">Serif book</option><option value="sans">Sans clean</option><option value="dyslexic">Readable wide</option><option value="mono">Mono</option>
        </select>
        <button onClick={toggleBookmark}>{bookmarked ? "🔖 Додано" : "🔖 Закладка"}</button>
        <button onClick={shareChapter}>📤 Поділитися в Telegram</button>
        <button onClick={cacheCurrentChapter}>{offlineReady ? "✅ Офлайн" : "⬇️ Офлайн"}</button>
      </section>
      <section id="reader-narration-panel" className={`reader__narration-player ${narrationOpen ? "reader__narration-player--open" : ""}`} aria-label="Озвучення глави" aria-hidden={!narrationOpen}>
        <div className="reader__player-grip" />
        <div className="reader__player-header"><div><p>Audio reader</p><strong>{chapter.title}</strong></div><button onClick={() => { stopNarration(); setNarrationOpen(false); }} aria-label="Закрити озвучення">✕</button></div>
        {!narrationSupported ? (
          <p className="reader__narration-warning">Озвучення недоступне у цьому браузері. Відкрийте NovelVerse у середовищі зі SpeechSynthesis, щоб слухати глави.</p>
        ) : (
          <>
            <input className="reader__progress-slider" type="range" min="0" max={Math.max(paragraphs.length - 1, 0)} value={currentParagraphIndex} onChange={(e) => scrubNarration(e.target.value)} disabled={!paragraphs.length} aria-label="Прогрес озвучення" />
            <div className="reader__player-time"><span>{formatClock(elapsedSeconds)}</span><span>{currentParagraphIndex + 1}/{paragraphs.length || 1}</span><span>{formatClock(estimatedTotalSeconds)}</span></div>
            <div className="reader__media-controls">
              <button onClick={() => moveParagraph(-1)} disabled={!paragraphs.length || currentParagraphIndex === 0} aria-label="Попередній параграф">⏮</button>
              <button className="reader__play-button" onClick={() => ttsPaused ? resumeNarration() : ttsActive ? pauseNarration() : speakParagraph(currentParagraphIndex)} disabled={!paragraphs.length} aria-label="Відтворити або пауза">{ttsActive && !ttsPaused ? "⏸" : "▶"}</button>
              <button onClick={() => moveParagraph(1)} disabled={!paragraphs.length || currentParagraphIndex >= paragraphs.length - 1} aria-label="Наступний параграф">⏭</button>
              <button onClick={restartNarration} disabled={!paragraphs.length} aria-label="Спочатку">↻</button>
            </div>
            <div className="reader__speed-row"><label>Speed<select value={narrationSettings.rate} onChange={(e) => updateNarrationRate(Number(e.target.value))}><option value="0.75">0.75x</option><option value="1">1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option></select></label></div>
            <details className="reader__player-settings"><summary>Voice & sleep timer</summary><label>Sleep timer <select value={sleepTimerMinutes} onChange={(e) => updateSleepTimer(Number(e.target.value))}><option value="0">Вимкнено</option><option value="5">5 хв</option><option value="10">10 хв</option><option value="20">20 хв</option><option value="30">30 хв</option><option value="45">45 хв</option></select></label><label>Голос <select value={narrationSettings.voiceURI} onChange={(e) => setNarrationSettings({ ...narrationSettings, voiceURI: e.target.value })}><option value="">Авто: Українська / Русский / English</option>{voices.map((voice) => <option value={voice.voiceURI} key={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}</select></label></details>
          </>
        )}
      </section>
    </main>
  );
}

export default Reader;
