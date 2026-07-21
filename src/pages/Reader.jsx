import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { addReadingHistory, getCurrentUser, syncReadingProgress, userKey, readList, readCloudBackedList, writeCloudBackedList } from "../lib/userFeatures";
import { deleteDownloadedChapter, getDownloadedChapter, getDownloadedNovelChapters, saveDownloadedChapter } from "../lib/offlineStorage";
import { shareToTelegram, telegramCloudGetItem, telegramCloudSetItem } from "../lib/telegram";
import { useTelegramBackButton, useTelegramMainButton } from "../hooks/useTelegram";
import "../styles/Reader.css";

const defaultSettings = { fontSize: 20, lineHeight: 1.9, textWidth: 760, theme: "dark", fontFamily: "serif" };
const fontFamilies = { serif: "Georgia, \"Times New Roman\", serif", sans: "Inter, system-ui, -apple-system, sans-serif", dyslexic: "Verdana, Arial, sans-serif", mono: "\"Courier New\", monospace" };
const defaultNarrationSettings = { rate: 1, pitch: 1, volume: 1, voiceURI: "", autoNextChapter: false };
const chapterRangeSize = 20;
const supportedRates = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
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
  return {
    ...defaultNarrationSettings,
    ...saved,
    rate: Math.min(3, Math.max(0.5, Number(saved?.rate) || defaultNarrationSettings.rate)),
    pitch: Math.min(2, Math.max(0, Number(saved?.pitch) || defaultNarrationSettings.pitch)),
    volume: Math.min(1, Math.max(0, Number(saved?.volume ?? defaultNarrationSettings.volume))),
    autoNextChapter: saved?.autoNextChapter === true,
  };
}

function stripReaderMarkup(content = "") {
  const withoutTags = String(content)
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|h[1-6]|li|blockquote)\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ");
  if (typeof document === "undefined") return withoutTags;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = withoutTags;
  return textarea.value;
}

function splitChapterIntoParagraphs(content = "") {
  return stripReaderMarkup(content)
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitParagraphIntoSentences(paragraph = "") {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
    return [...segmenter.segment(paragraph)].map((part) => part.segment.trim()).filter(Boolean);
  }
  const protectedText = paragraph.replace(/\b(Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|т\.д|т\.п|им|п|вул|м|р|див)\./giu, (match) => match.replace(/\./g, "∯"));
  return protectedText.split(/(?<=[.!?…])\s+(?=[\p{Lu}\p{N}«“"(—-])/u).map((sentence) => sentence.replace(/∯/g, ".").trim()).filter(Boolean);
}

function getChapterAudioCacheKey(chapterId) {
  return `readerChapterAudioCache_${chapterId}`;
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

function getVoiceScore(voice, chapterLanguage) {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let score = lang.startsWith(chapterLanguage) ? 100 : 0;
  if (["natural", "neural", "online", "enhanced", "premium", "google", "microsoft"].some((term) => name.includes(term))) score += 35;
  if (voice.localService) score += 6;
  if (["default", "compact", "basic", "legacy", "espeak", "festival"].some((term) => name.includes(term))) score -= 25;
  return score;
}

function getChapterRanges(chapters = []) {
  const highest = chapters.reduce((max, item) => Math.max(max, Number(item.number) || 0), 0);
  return Array.from({ length: Math.ceil(highest / chapterRangeSize) }, (_, index) => {
    const start = index * chapterRangeSize + 1;
    const end = start + chapterRangeSize - 1;
    return { key: `${start}-${end}`, start, end, chapters: chapters.filter((item) => item.number >= start && item.number <= end) };
  }).filter((range) => range.chapters.length);
}

function Reader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState(null);
  const [user, setUser] = useState(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [downloadState, setDownloadState] = useState("idle");
  const [audioCacheState, setAudioCacheState] = useState("idle");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [navMessage, setNavMessage] = useState("");
  const [settings, setSettings] = useState(getReaderSettings);
  const [settingsOpen, setSettingsOpen] = useState(getReaderPanelOpen);
  const [narrationOpen, setNarrationOpen] = useState(false);
  const [ttsActive, setTtsActive] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [narrationSettings, setNarrationSettings] = useState(getNarrationSettings);
  const [sleepTimerMode, setSleepTimerMode] = useState("off");
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState(0);
  const [audioAnnouncement, setAudioAnnouncement] = useState("");
  const [navigatingChapter, setNavigatingChapter] = useState(false);
  const [adjacentChapters, setAdjacentChapters] = useState({ previous: null, next: null });
  const [chapterList, setChapterList] = useState([]);
  const [selectedRangeKey, setSelectedRangeKey] = useState(localStorage.getItem("readerSelectedChapterRange") || "");
  const sleepTimerRef = useRef(null);
  const sleepTimerEndsAtRef = useRef(0);
  const speechTokenRef = useRef(0);
  const [voices, setVoices] = useState([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(() => getSavedNarrationPosition(id));
  const [controlsVisible, setControlsVisible] = useState(true);
  const [readingProgress, setReadingProgress] = useState(0);
  const [tapStart, setTapStart] = useState(null);
  const utteranceRef = useRef(null);
  const manuallyStoppingRef = useRef(false);
  const [audioReady, setAudioReady] = useState(false);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const pendingAutoplayRef = useRef(false);

  const toggleBookmark = useCallback(async () => {
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
  }, [bookmarked, chapter, user]);

  useTelegramBackButton(true, chapter ? `/novel/${chapter.novel_id}` : "/");

  const mainButtonConfig = useMemo(() => ({
    text: bookmarked ? "Remove bookmark" : "Bookmark",
    onClick: toggleBookmark,
    disabled: !chapter,
  }), [bookmarked, chapter, toggleBookmark]);

  useTelegramMainButton(mainButtonConfig);

  const chapterContent = chapter?.content ?? "";
  const chapterNumber = Number(chapter?.number) || 0;
  const paragraphs = useMemo(() => splitChapterIntoParagraphs(chapterContent), [chapterContent]);
  const sentences = useMemo(() => paragraphs.flatMap((paragraph, paragraphIndex) => splitParagraphIntoSentences(paragraph).map((text) => ({ text, paragraphIndex }))), [paragraphs]);
  const narrationSupported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const estimatedTotalSeconds = useMemo(() => Math.max(1, Math.round(sentences.map((sentence) => sentence.text).join(" ").split(/\s+/).filter(Boolean).length / (165 * narrationSettings.rate) * 60)), [sentences, narrationSettings.rate]);
  const elapsedSeconds = useMemo(() => Math.round((currentSentenceIndex / Math.max(1, sentences.length)) * estimatedTotalSeconds), [currentSentenceIndex, estimatedTotalSeconds, sentences.length]);
  const sentenceProgress = sentences.length ? Math.round(((currentSentenceIndex + (ttsActive ? 1 : 0)) / sentences.length) * 100) : 0;
  const chapterLanguage = useMemo(() => getVoiceLanguage(chapterContent), [chapterContent]);
  const rankedVoices = useMemo(() => [...voices].sort((a, b) => getVoiceScore(b, chapterLanguage) - getVoiceScore(a, chapterLanguage) || a.name.localeCompare(b.name)), [voices, chapterLanguage]);
  const selectedVoice = useMemo(() => rankedVoices.find((voice) => voice.voiceURI === narrationSettings.voiceURI) || rankedVoices[0] || null, [rankedVoices, narrationSettings.voiceURI]);
  const chapterRanges = useMemo(() => getChapterRanges(chapterList), [chapterList]);
  const currentRangeKey = useMemo(() => {
    return chapterRanges.find((range) => chapterNumber >= range.start && chapterNumber <= range.end)?.key || "";
  }, [chapterNumber, chapterRanges]);
  const selectedRangeExists = chapterRanges.some((range) => range.key === selectedRangeKey);
  const openRangeKey = selectedRangeExists ? selectedRangeKey : currentRangeKey;

  const loadChapterRef = useRef(null);

  const loadAdjacentChapters = useCallback(async (activeChapter) => {
    try {
      const [previousResult, nextResult] = await Promise.all([
        supabase.from("chapters").select("id").eq("novel_id", activeChapter.novel_id).lt("number", activeChapter.number).order("number", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("chapters").select("id").eq("novel_id", activeChapter.novel_id).gt("number", activeChapter.number).order("number", { ascending: true }).limit(1).maybeSingle(),
      ]);
      if (!previousResult.error && !nextResult.error) {
        setAdjacentChapters({ previous: previousResult.data, next: nextResult.data });
        return;
      }
    } catch {
      // Fall back to downloaded chapters when online navigation lookup fails.
    }
    const offline = await getDownloadedNovelChapters(activeChapter.novel_id).catch(() => []);
    const index = offline.findIndex((item) => item.chapter_id === activeChapter.id);
    setAdjacentChapters({ previous: index > 0 ? { id: offline[index - 1].chapter_id } : null, next: index >= 0 && index < offline.length - 1 ? { id: offline[index + 1].chapter_id } : null });
  }, []);

  const loadChapterMetadata = useCallback(async (activeChapter) => {
    const offline = await getDownloadedNovelChapters(activeChapter.novel_id).catch(() => []);
    const offlineIds = new Set(offline.map((item) => String(item.chapter_id)));
    try {
      const result = await supabase.from("chapters").select("id, number, title").eq("novel_id", activeChapter.novel_id).order("number", { ascending: true });
      if (!result.error && result.data?.length) {
        setChapterList(result.data.map((item) => ({ id: String(item.id), number: Number(item.number), title: item.title, availableOffline: offlineIds.has(String(item.id)), downloaded: offlineIds.has(String(item.id)) })));
        return;
      }
    } catch {
      // Use downloaded metadata when online chapter metadata is unavailable.
    }
    setChapterList(offline.map((item) => ({ id: String(item.chapter_id), number: Number(item.chapter_number), title: item.chapter_title, availableOffline: true, downloaded: true })));
  }, []);

  const loadChapter = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    const currentUser = await getCurrentUser(supabase);
    setUser(currentUser);
    let data;
    let error;
    try {
      const result = await supabase.from("chapters").select("*").eq("id", id).single();
      data = result.data;
      error = result.error;
    } catch (requestError) {
      error = requestError;
    }
    const cached = await getDownloadedChapter(id).catch(() => null);

    if (error && !cached) {
      setErrorMessage("Ця глава недоступна офлайн.");
      setLoading(false);
      return;
    }

    const activeChapter = data || { ...cached, id: cached.chapter_id, number: cached.chapter_number, title: cached.chapter_title };
    setOfflineMode(!data && !!cached);
    const audioKey = userKey(currentUser?.id, "audioProgress");
    const savedAudio = (await readCloudBackedList(audioKey, telegramCloudGetItem)).find((item) => item.chapter_id === activeChapter.id);
    setCurrentSentenceIndex(Math.min(Math.max(Number(savedAudio?.audio_sentence_index ?? savedAudio?.audio_paragraph_index ?? getSavedNarrationPosition(activeChapter.id)) || 0, 0), Math.max(splitChapterIntoParagraphs(activeChapter.content).flatMap(splitParagraphIntoSentences).length - 1, 0)));
    setAudioCacheState(localStorage.getItem(getChapterAudioCacheKey(activeChapter.id)) ? "cached" : "idle");
    setChapter(activeChapter);
    await Promise.all([loadAdjacentChapters(activeChapter), loadChapterMetadata(activeChapter)]);
    setOfflineReady(!!cached);
    setDownloadState(cached ? "downloaded" : "idle");
    const cloudSettings = await telegramCloudGetItem("novelverse:readerSettings");
    if (cloudSettings) {
      try { setSettings((current) => ({ ...current, ...JSON.parse(cloudSettings) })); } catch { /* keep local settings */ }
    }
    const bookmarks = await readCloudBackedList(userKey(currentUser?.id, "bookmarks"), telegramCloudGetItem);
    setBookmarked(bookmarks.some((item) => item.chapter_id === activeChapter.id));

    localStorage.setItem(`lastChapter_${activeChapter.novel_id}`, activeChapter.id);

    const readKey = `readChapters_${activeChapter.novel_id}`;
    const read = await readCloudBackedList(readKey, telegramCloudGetItem);
    if (!read.includes(activeChapter.id)) await writeCloudBackedList(readKey, [...read, activeChapter.id], telegramCloudSetItem);

    await addReadingHistory(supabase, currentUser, { novel_id: activeChapter.novel_id, chapter_id: activeChapter.id, chapter_title: activeChapter.title });
    setNavigatingChapter(false);
    setLoading(false);
  }, [id, loadAdjacentChapters, loadChapterMetadata]);

  useEffect(() => {
    loadChapterRef.current = loadChapter;
  }, [loadChapter]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadChapterRef.current?.();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [id]);

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
    const timeoutId = window.setTimeout(saveScroll, 0);
    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("resize", saveScroll);
    return () => { window.clearTimeout(timeoutId); window.removeEventListener("scroll", saveScroll); window.removeEventListener("resize", saveScroll); };
  }, [id, chapter, user]);

  useEffect(() => () => {
    speechTokenRef.current += 1;
    if (narrationSupported) { manuallyStoppingRef.current = true; window.speechSynthesis.cancel(); manuallyStoppingRef.current = false; }
    clearTimeout(sleepTimerRef.current);
  }, [id, narrationSupported]);

  useEffect(() => {
    if (!narrationSupported || !audioReady) return undefined;
    function loadVoices() {
      setVoices(window.speechSynthesis.getVoices());
    }
    const timeoutId = window.setTimeout(loadVoices, 0);
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => { window.clearTimeout(timeoutId); window.speechSynthesis.removeEventListener("voiceschanged", loadVoices); };
  }, [audioReady, narrationSupported]);

  useEffect(() => {
    if (!chapter) return;
    localStorage.setItem(getNarrationPositionKey(chapter.id), currentSentenceIndex);
    const record = { novel_id: chapter.novel_id, chapter_id: chapter.id, audio_sentence_index: currentSentenceIndex, audio_paragraph_index: currentSentenceIndex, audio_progress: sentenceProgress, scroll_y: window.scrollY, progress: readingProgress };
    const audioKey = userKey(user?.id, "audioProgress");
    const localAudio = readList(audioKey).filter((item) => item.chapter_id !== chapter.id);
    writeCloudBackedList(audioKey, [{ ...record, updated_at: new Date().toISOString() }, ...localAudio].slice(0, 50), telegramCloudSetItem);
    if (user) supabase.from("reading_progress").upsert({ ...record, user_id: user.id, updated_at: new Date().toISOString() }, { onConflict: "user_id,novel_id" });
  }, [chapter, currentSentenceIndex, sentenceProgress, readingProgress, user]);

  useEffect(() => {
    if (sleepTimerMode === "off" || !sleepTimerEndsAtRef.current) { setSleepRemainingSeconds(0); return undefined; }
    const intervalId = window.setInterval(() => setSleepRemainingSeconds(Math.max(0, Math.ceil((sleepTimerEndsAtRef.current - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(intervalId);
  }, [sleepTimerMode]);

  async function goToAdjacentChapter(direction) {
    if (!chapter || navigatingChapter) return;
    const target = direction < 0 ? adjacentChapters.previous : adjacentChapters.next;
    if (!target) {
      setNavMessage(direction > 0 ? "Наступна глава недоступна офлайн." : "Попередня глава недоступна офлайн.");
      window.setTimeout(() => setNavMessage(""), 3500);
      return;
    }
    setNavigatingChapter(true);
    stopNarration();
    navigate(`/reader/${target.id}`, { preventScrollReset: true });
  }

  function previousChapter() { goToAdjacentChapter(-1); }

  function nextChapter() { goToAdjacentChapter(1); }

  function chooseChapter(targetChapter, playWhenLoaded = true) {
    if (!targetChapter || navigatingChapter) return;
    if (!targetChapter.downloaded && offlineMode) {
      setNavMessage("Ця глава недоступна офлайн.");
      window.setTimeout(() => setNavMessage(""), 3500);
      return;
    }
    pendingAutoplayRef.current = playWhenLoaded;
    const range = chapterRanges.find((item) => targetChapter.number >= item.start && targetChapter.number <= item.end);
    if (range) {
      setSelectedRangeKey(range.key);
      localStorage.setItem("readerSelectedChapterRange", range.key);
    }
    stopNarration();
    if (String(targetChapter.id) === String(chapter?.id)) {
      setCurrentSentenceIndex(0);
      if (playWhenLoaded) window.setTimeout(() => speakSentence(0), 0);
      return;
    }
    setNavigatingChapter(true);
    navigate(`/reader/${targetChapter.id}`, { preventScrollReset: true });
  }



  async function toggleDownloadChapter() {
    if (!chapter || downloadState === "loading") return;
    if (offlineReady) {
      if (!window.confirm("Видалити завантажену главу?")) return;
      await deleteDownloadedChapter(chapter.id);
      setOfflineReady(false);
      setDownloadState("idle");
      return;
    }
    setDownloadState("loading");
    try {
      await saveDownloadedChapter(chapter, chapter.novel || { id: chapter.novel_id });
      setOfflineReady(true);
      setDownloadState("downloaded");
      await loadChapterMetadata(chapter);
    } catch (error) {
      alert(error.message || "Не вдалося зберегти главу.");
      setDownloadState("error");
    }
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

  function speakSentence(index = currentSentenceIndex, nextSettings = narrationSettings) {
    if (!chapter || !narrationSupported || !sentences.length) return;
    const safeIndex = Math.min(Math.max(index, 0), sentences.length - 1);
    const token = speechTokenRef.current + 1;
    speechTokenRef.current = token;
    manuallyStoppingRef.current = true;
    window.speechSynthesis.cancel();
    manuallyStoppingRef.current = false;
    const utterance = new SpeechSynthesisUtterance(sentences[safeIndex].text);
    utterance.lang = selectedVoice?.lang || getVoiceLanguage(sentences[safeIndex].text);
    utterance.voice = selectedVoice;
    utterance.rate = nextSettings.rate;
    utterance.pitch = nextSettings.pitch;
    utterance.volume = nextSettings.volume;
    utterance.onend = () => {
      if (manuallyStoppingRef.current || speechTokenRef.current !== token) return;
      if (safeIndex < sentences.length - 1) speakSentence(safeIndex + 1, nextSettings);
      else {
        setTtsActive(false);
        setTtsPaused(false);
        handleChapterFinished();
      }
    };
    utterance.onerror = () => {
      if (speechTokenRef.current !== token) return;
      setTtsActive(false);
      setTtsPaused(false);
      setAudioAnnouncement("Помилка озвучення. Спробуйте інший голос або браузер.");
    };
    utteranceRef.current = utterance;
    setCurrentSentenceIndex(safeIndex);
    setTtsActive(true);
    setTtsPaused(false);
    setAudioAnnouncement(`Озвучення: ${sentenceProgress}% глави.`);
    window.speechSynthesis.speak(utterance);
  }

  function handleChapterFinished() {
    setAudioAnnouncement("Озвучення глави завершено.");
    if (narrationSettings.autoNextChapter) {
      const next = adjacentChapters.next;
      if (next) {
        pendingAutoplayRef.current = true;
        setNavigatingChapter(true);
        navigate(`/reader/${next.id}`, { preventScrollReset: true });
      } else {
        setNavMessage("Наступна глава недоступна офлайн.");
        window.setTimeout(() => setNavMessage(""), 3500);
      }
    }
  }

  function stopNarration() {
    if (narrationSupported) { manuallyStoppingRef.current = true; window.speechSynthesis.cancel(); manuallyStoppingRef.current = false; }
    utteranceRef.current = null;
    setTtsActive(false);
    setTtsPaused(false);
    setSleepTimerMode("off");
    clearTimeout(sleepTimerRef.current);
    sleepTimerEndsAtRef.current = 0;
    setAudioAnnouncement("Озвучення зупинено.");
  }

  function pauseNarration() {
    if (!narrationSupported) return;
    window.speechSynthesis.pause();
    setTtsPaused(true);
    setAudioAnnouncement("Озвучення призупинено.");
  }

  function resumeNarration() {
    if (!narrationSupported) return;
    window.speechSynthesis.resume();
    setTtsActive(true);
    setTtsPaused(false);
  }

  function moveSentence(direction) {
    const target = Math.min(Math.max(currentSentenceIndex + direction, 0), Math.max(sentences.length - 1, 0));
    setCurrentSentenceIndex(target);
    if (ttsActive || ttsPaused) speakSentence(target);
  }

  function restartCurrentSentence() {
    if (ttsActive || ttsPaused) speakSentence(currentSentenceIndex);
  }

  function restartNarration() {
    stopNarration();
    if (chapter) localStorage.removeItem(getNarrationPositionKey(chapter.id));
    setCurrentSentenceIndex(0);
    if (sentences.length) speakSentence(0);
  }

  function scrubNarration(value) {
    const target = Math.min(Math.max(Number(value), 0), Math.max(sentences.length - 1, 0));
    setCurrentSentenceIndex(target);
    if (ttsActive || ttsPaused) speakSentence(target);
  }

  function updateNarrationSetting(key, value) {
    const next = { ...narrationSettings, [key]: key === "rate" ? supportedRates.includes(Number(value)) ? Number(value) : 1 : value };
    setNarrationSettings(next);
    if (ttsActive || ttsPaused) setTimeout(() => speakSentence(currentSentenceIndex, next), 0);
  }

  function updateSleepTimer(mode, selectedAt = 0) {
    setSleepTimerMode(mode);
    clearTimeout(sleepTimerRef.current);
    sleepTimerEndsAtRef.current = 0;
    const minutes = Number(mode);
    if (minutes > 0) {
      sleepTimerEndsAtRef.current = selectedAt + minutes * 60 * 1000;
      setSleepRemainingSeconds(minutes * 60);
      sleepTimerRef.current = setTimeout(() => stopNarration(), minutes * 60 * 1000);
    } else setSleepRemainingSeconds(0);
  }


  useEffect(() => {
    if (!pendingAutoplayRef.current || loading || !chapter || !sentences.length || !narrationSupported) return;
    pendingAutoplayRef.current = false;
    setAudioReady(true);
    setNarrationOpen(true);
    speakSentence(0);
  }, [chapter, loading, narrationSupported, sentences.length]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !chapter) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: chapter.title, artist: chapter.novel?.title || "NovelVerse", album: `Chapter ${chapter.number || ""}` });
    navigator.mediaSession.playbackState = ttsActive && !ttsPaused ? "playing" : ttsPaused ? "paused" : "none";
    navigator.mediaSession.setActionHandler("play", () => (ttsPaused ? resumeNarration() : speakSentence(currentSentenceIndex)));
    navigator.mediaSession.setActionHandler("pause", pauseNarration);
    navigator.mediaSession.setActionHandler("previoustrack", () => moveSentence(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => moveSentence(1));
    return () => {
      navigator.mediaSession.playbackState = "none";
      ["play", "pause", "previoustrack", "nexttrack"].forEach((action) => navigator.mediaSession.setActionHandler(action, null));
    };
  }, [chapter, currentSentenceIndex, ttsActive, ttsPaused]);

  function cacheSpokenChapter() {
    if (!chapter || !sentences.length) return;
    try {
      localStorage.setItem(getChapterAudioCacheKey(chapter.id), JSON.stringify({ chapter_id: chapter.id, voiceURI: narrationSettings.voiceURI, rate: narrationSettings.rate, sentences: sentences.map((sentence) => sentence.text), cached_at: new Date().toISOString() }));
      setAudioCacheState("cached");
    } catch {
      setAudioCacheState("error");
    }
  }

  function openAudioPlayer() {
    setAudioReady(true);
    setNarrationOpen(true);
  }

  if (loading) return <main className="reader reader--dark"><div className="reader__shell"><div className="skeleton reader__skeleton" /></div></main>;
  if (errorMessage) return <main className="reader reader--dark"><div className="reader__shell"><div className="error-state">{errorMessage}</div></div></main>;

  return (
    <main className={`reader reader--${settings.theme} ${controlsVisible ? "reader--controls-visible" : "reader--immersive"}`}>
      <button className="reader__settings-toggle" onClick={() => setSettingsOpen(true)} aria-expanded={settingsOpen} aria-controls="reader-settings-panel">⚙️<span>Налаштування</span></button>
      <button className="reader__audio-toggle" onClick={() => narrationOpen ? setNarrationOpen(false) : openAudioPlayer()} aria-expanded={narrationOpen} aria-controls="reader-narration-panel">🔊<span>Аудіо</span></button>
      <div className="sr-only" aria-live="polite">{audioAnnouncement}</div>
      <div className="reader__reading-progress" aria-label={`Прогрес читання ${readingProgress}%`}><span style={{ width: `${readingProgress}%` }} /></div>
      {navMessage && <div className="reader__offline-message">{navMessage}</div>}
      <div className="reader__controls reader__controls--top" aria-hidden={!controlsVisible}>
        <div className="reader__controls-inner" style={{ maxWidth: `${settings.textWidth}px` }}>
          <button className="reader__back reader__back--compact" onClick={() => navigate(`/novel/${chapter.novel_id}`)}>← Глави</button>
          <header className="reader__header">
            <span>Глава {chapter.number} {offlineMode && <b className="reader__offline-badge">Офлайн-режим</b>}</span>
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
          {paragraphs.map((paragraph, paragraphIndex) => (
            <p className="reader__paragraph" key={`${chapter.id}-${paragraphIndex}`}>{paragraph}</p>
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
        <button onClick={toggleDownloadChapter}>{downloadState === "loading" ? "Завантаження…" : downloadState === "downloaded" ? "Завантажено · видалити" : downloadState === "error" ? "Помилка — повторити" : "Завантажити главу"}</button>
      </section>
      <section id="reader-narration-panel" className={`reader__narration-player ${narrationOpen ? "reader__narration-player--open" : ""} ${playerExpanded ? "reader__narration-player--expanded" : "reader__narration-player--mini"}`} aria-label="Озвучення глави" aria-hidden={!narrationOpen}>
        <button className="reader__player-grip" onClick={() => setPlayerExpanded((expanded) => !expanded)} aria-label={playerExpanded ? "Згорнути аудіоплеєр" : "Розгорнути аудіоплеєр"} />
        <div className="reader__player-header"><button className="reader__player-collapse" onClick={() => setPlayerExpanded((expanded) => !expanded)}>{playerExpanded ? "⌄" : "⌃"}</button><div><p>{chapter.novel?.title || chapter.novel_title || "NovelVerse"}</p><strong>Глава {chapter.number}: {chapter.title}</strong></div><button onClick={() => { stopNarration(); setNarrationOpen(false); }} aria-label="Закрити озвучення">✕</button></div>
        {!narrationSupported ? (
          <p className="reader__narration-warning">Озвучення недоступне у цьому браузері. Відкрийте NovelVerse у середовищі зі SpeechSynthesis, щоб слухати глави.</p>
        ) : (
          <>
            <input className="reader__progress-slider" type="range" min="0" max={Math.max(sentences.length - 1, 0)} value={currentSentenceIndex} onChange={(e) => scrubNarration(e.target.value)} disabled={!sentences.length} aria-label="Прогрес озвучення" />
            <div className="reader__player-time"><span>{formatClock(elapsedSeconds)}</span><span>{sentenceProgress}% · {ttsActive && !ttsPaused ? "Playing" : ttsPaused ? "Paused" : "Ready"}</span><span>{formatClock(estimatedTotalSeconds)}</span></div><div className="reader__player-meta"><span>Voice: {selectedVoice ? `${selectedVoice.name} (${selectedVoice.lang})` : "Best available voice"}</span><span>Speed: {narrationSettings.rate}x</span></div>
            <div className="reader__media-controls">
              <button onClick={previousChapter} disabled={navigatingChapter || !adjacentChapters.previous} aria-label="Попередня глава">⏪</button>
              <button onClick={() => moveSentence(-1)} disabled={!sentences.length || currentSentenceIndex === 0} aria-label="Попереднє речення">⏮</button>
              <button className="reader__play-button" onClick={() => ttsPaused ? resumeNarration() : ttsActive ? pauseNarration() : speakSentence(currentSentenceIndex)} disabled={!sentences.length} aria-label="Відтворити або пауза">{ttsActive && !ttsPaused ? "⏸" : "▶"}</button>
              <button onClick={() => moveSentence(1)} disabled={!sentences.length || currentSentenceIndex >= sentences.length - 1} aria-label="Наступне речення">⏭</button>
              <button onClick={nextChapter} disabled={navigatingChapter || !adjacentChapters.next} aria-label="Наступна глава">⏩</button>
              <button onClick={stopNarration} disabled={!ttsActive && !ttsPaused} aria-label="Зупинити">⏹</button>
              <button onClick={restartCurrentSentence} disabled={!sentences.length} aria-label="Повторити поточне речення">↺</button>
              <button onClick={restartNarration} disabled={!sentences.length} aria-label="Почати главу спочатку">↻</button>
            </div>
            <div className="reader__speed-row"><label>Speed<select value={narrationSettings.rate} onChange={(e) => updateNarrationSetting("rate", Number(e.target.value))}><option value="0.5">0.5x</option><option value="0.75">0.75x</option><option value="1">1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option><option value="2.5">2.5x</option><option value="3">3x</option></select></label></div>
            <details className="reader__player-settings" open={playerExpanded}><summary>Voice & sleep timer</summary><label><input type="checkbox" checked={narrationSettings.autoNextChapter} onChange={(e) => updateNarrationSetting("autoNextChapter", e.target.checked)} /> Auto next chapter</label><label>Sleep timer <select value={sleepTimerMode} onChange={(e) => updateSleepTimer(e.target.value, Date.now())}><option value="off">Вимкнено</option><option value="15">15 хв</option><option value="30">30 хв</option><option value="60">60 хв</option></select></label>{sleepRemainingSeconds > 0 && <p className="reader__narration-status">Таймер сну: {formatClock(sleepRemainingSeconds)}</p>}<label>Голос <select value={narrationSettings.voiceURI} onChange={(e) => updateNarrationSetting("voiceURI", e.target.value)}><option value="">Best available voice</option>{rankedVoices.map((voice) => <option value={voice.voiceURI} key={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}</select></label><p className="reader__narration-status">Voice quality depends on voices installed on your device and browser.</p><p className="reader__narration-status">{offlineMode ? "Офлайн: озвучення працює з завантаженим текстом, якщо WebView підтримує SpeechSynthesis." : "Онлайн: використовується браузерний SpeechSynthesis без платних TTS API."}</p><button type="button" onClick={cacheSpokenChapter}>{audioCacheState === "cached" ? "Аудіо-кеш готовий" : audioCacheState === "error" ? "Кеш недоступний" : "Кешувати озвучення"}</button><label>Pitch <input type="range" min="0" max="2" step="0.1" value={narrationSettings.pitch} onChange={(e) => updateNarrationSetting("pitch", Number(e.target.value))} /></label><label>Volume <input type="range" min="0" max="1" step="0.05" value={narrationSettings.volume} onChange={(e) => updateNarrationSetting("volume", Number(e.target.value))} /></label></details>
            <div className="reader__chapter-selector" aria-label="Chapter selector">
              <div className="reader__range-tabs">
                {chapterRanges.map((range) => (
                  <button
                    type="button"
                    className={`${range.key === openRangeKey ? "reader__range-tab reader__range-tab--open" : "reader__range-tab"} ${range.key === currentRangeKey ? "reader__range-tab--current" : ""}`}
                    key={range.key}
                    onClick={() => { setSelectedRangeKey(range.key); localStorage.setItem("readerSelectedChapterRange", range.key); }}
                  >
                    {range.start}–{range.end}
                  </button>
                ))}
              </div>
              {chapterRanges.filter((range) => range.key === openRangeKey).map((range) => (
                <div className="reader__chapter-list" key={range.key}>
                  {range.chapters.map((item) => {
                    const isCurrent = String(item.id) === String(chapter.id);
                    const unavailable = offlineMode && !item.downloaded;
                    return (
                      <button type="button" className={`${isCurrent ? "reader__chapter-choice reader__chapter-choice--current" : "reader__chapter-choice"} ${unavailable ? "reader__chapter-choice--unavailable" : ""}`} key={item.id} disabled={unavailable || navigatingChapter} onClick={() => chooseChapter(item, true)}>
                        <span>Глава {item.number}</span>
                        <strong>{item.title}</strong>
                        <em>{isCurrent ? "Playing" : item.downloaded ? "Downloaded" : unavailable ? "Unavailable offline" : "Stream"}</em>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default Reader;
