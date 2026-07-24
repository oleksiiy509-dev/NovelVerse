import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { audioModes, defaultAudioLanguage, defaultAudioVoice, formatFileSize, getAudioDownloadKey, getAudioPositionKey, getChapterAudioMetadata, getSavedAudioMode, saveAudioMode } from "../lib/chapterAudio";
import { addReadingHistory, getCurrentUser, syncReadingProgress, userKey, readList, readCloudBackedList, writeCloudBackedList } from "../lib/userFeatures";
import { deleteDownloadedChapter, getDownloadedChapter, getDownloadedNovelChapters, saveDownloadedChapter } from "../lib/offlineStorage";
import { shareToTelegram, telegramCloudGetItem, telegramCloudSetItem } from "../lib/telegram";
import { fetchChapterVoiceSegments, fetchNovelVoiceCast, fetchReadyDirectorPlan } from "../lib/voiceEngine/client";
import { hashDirectorContent } from "../lib/voiceDirector/director";
import { directTextPerformance, loadAiDirector2Settings, narrationPresets, saveAiDirector2Settings } from "../lib/voiceDirector/aiDirector2";
import { getPreviewSettings, voiceProfiles } from "../lib/voiceEngine/voiceProfiles";
import { assignVoiceToProfile, buildPersistentCharacterRegistry, loadCharacterRegistry, mergeCharacterAliases, resetCharacterToAutomatic, resolveCharacterVoiceForSegment, updateCharacterProfile } from "../lib/characterVoiceEngine";
import { defaultPiperVoiceId, getVoiceWorkerHealth, synthesizeVoiceWorkerAudio, splitTextForVoiceWorker } from "../lib/voiceWorker";
import { useTelegramBackButton, useTelegramMainButton } from "../hooks/useTelegram";
import "../styles/Reader.css";

const defaultSettings = { fontSize: 20, lineHeight: 1.9, textWidth: 760, theme: "dark", fontFamily: "serif" };
const fontFamilies = { serif: "Georgia, \"Times New Roman\", serif", sans: "Inter, system-ui, -apple-system, sans-serif", dyslexic: "Verdana, Arial, sans-serif", mono: "\"Courier New\", monospace" };
const emotionPresets = { calm: { label: "Calm", rate: 0.8, pitch: 0.9, pauseLength: 1.2 }, normal: { label: "Normal", rate: 0.85, pitch: 1, pauseLength: 1 }, dramatic: { label: "Dramatic", rate: 0.75, pitch: 1.15, pauseLength: 1.35 }, whisper: { label: "Whisper", rate: 0.65, pitch: 0.75, pauseLength: 1.5 } };
const defaultNarrationSettings = { rate: 0.85, pitch: 1, volume: 1, voiceURI: "", autoNextChapter: false, pauseLength: 1, sentencePause: 250, paragraphPause: 700, emotion: "normal", aiDirector2: loadAiDirector2Settings() };
const chapterRangeSize = 20;
const supportedRates = [0.5, 0.65, 0.75, 0.85, 1, 1.25, 1.5, 2, 2.5, 3];
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

function getNarrationSettings(storageKey = narrationSettingsKey) {
  const saved = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem(narrationSettingsKey) || "null");
  return {
    ...defaultNarrationSettings,
    ...saved,
    rate: Math.min(3, Math.max(0.5, Number(saved?.rate) || defaultNarrationSettings.rate)),
    pitch: Math.min(2, Math.max(0, Number(saved?.pitch) || defaultNarrationSettings.pitch)),
    volume: Math.min(1, Math.max(0, Number(saved?.volume ?? defaultNarrationSettings.volume))),
    pauseLength: Math.min(2.5, Math.max(0, Number(saved?.pauseLength ?? defaultNarrationSettings.pauseLength))),
    sentencePause: Math.min(3000, Math.max(0, Number(saved?.sentencePause ?? defaultNarrationSettings.sentencePause))),
    paragraphPause: Math.min(6000, Math.max(0, Number(saved?.paragraphPause ?? defaultNarrationSettings.paragraphPause))),
    emotion: emotionPresets[saved?.emotion] ? saved.emotion : defaultNarrationSettings.emotion,
    autoNextChapter: saved?.autoNextChapter === true,
    aiDirector2: loadAiDirector2Settings(),
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
  const [narrationMode, setNarrationMode] = useState(getSavedAudioMode);
  const [aiAudio, setAiAudio] = useState(null);
  const [aiAudioUrl, setAiAudioUrl] = useState("");
  const [aiAudioLoading, setAiAudioLoading] = useState(false);
  const [aiAudioDownloaded, setAiAudioDownloaded] = useState(false);
  const [aiAudioPlaying, setAiAudioPlaying] = useState(false);
  const [aiAudioTime, setAiAudioTime] = useState(0);
  const [aiAudioDuration, setAiAudioDuration] = useState(0);
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
  const [structuredPreview, setStructuredPreview] = useState(false);
  const [directorPreview, setDirectorPreview] = useState(false);
  const [directorPlan, setDirectorPlan] = useState(null);
  const [voiceSegments, setVoiceSegments] = useState([]);
  const [voiceCast, setVoiceCast] = useState([]);
  const castVoiceMapRef = useRef(new Map());
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const pendingAutoplayRef = useRef(false);
  const aiAudioRef = useRef(null);
  const localAudioRef = useRef(null);
  const localAudioUrlRef = useRef("");
  const localVoiceAbortRef = useRef(null);
  const localVoiceStoppedRef = useRef(false);
  const [localVoiceStatus, setLocalVoiceStatus] = useState({ online: false, piperAvailable: false, loading: true, error: "" });
  const [localVoiceState, setLocalVoiceState] = useState("idle");
  const [localVoiceError, setLocalVoiceError] = useState("");
  const [localVoiceChunkIndex, setLocalVoiceChunkIndex] = useState(0);
  const [localVoiceChunkTotal, setLocalVoiceChunkTotal] = useState(0);
  const [characterRegistry, setCharacterRegistry] = useState(() => loadCharacterRegistry("global"));
  const [characterStudioOpen, setCharacterStudioOpen] = useState(false);


  const revokeLocalAudioUrl = useCallback(() => {
    if (localAudioUrlRef.current) URL.revokeObjectURL(localAudioUrlRef.current);
    localAudioUrlRef.current = "";
  }, []);

  const stopLocalVoice = useCallback(() => {
    localVoiceStoppedRef.current = true;
    localVoiceAbortRef.current?.abort();
    localVoiceAbortRef.current = null;
    if (localAudioRef.current) { localAudioRef.current.pause(); localAudioRef.current.src = ""; localAudioRef.current = null; }
    revokeLocalAudioUrl();
    setLocalVoiceState("idle");
    setAudioAnnouncement("Локальне Piper озвучення зупинено.");
  }, [revokeLocalAudioUrl]);

  useEffect(() => {
    let cancelled = false;
    getVoiceWorkerHealth().then((health) => { if (!cancelled) setLocalVoiceStatus({ ...health, loading: false, error: "" }); }).catch((error) => { if (!cancelled) setLocalVoiceStatus({ online: false, piperAvailable: false, loading: false, error: error.message || "Voice Worker offline" }); });
    return () => { cancelled = true; stopLocalVoice(); };
  }, [stopLocalVoice]);

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
  const plainSentences = useMemo(() => paragraphs.flatMap((paragraph, paragraphIndex) => splitParagraphIntoSentences(paragraph).map((text) => ({ text, paragraphIndex, voiceProfile: "narrator_neutral" }))), [paragraphs]);
  const castByCharacter = useMemo(() => new Map(voiceCast.map((entry) => [String(entry.character_id), entry])), [voiceCast]);
  const structuredSentences = useMemo(() => voiceSegments.flatMap((segment, segmentIndex) => { const castEntry = castByCharacter.get(String(segment.speaker_id)); const registryProfile = resolveCharacterVoiceForSegment(segment, characterRegistry); const isNarration = (segment.segment_type || segment.type) === "narration"; return splitParagraphIntoSentences(segment.text || "").map((text) => ({ text, paragraphIndex: segmentIndex, voiceProfile: isNarration ? registryProfile.preferredVoice : registryProfile.preferredVoice || castEntry?.voice_profile || segment.voice_profile || "unknown_neutral", speakerName: isNarration ? registryProfile.name : registryProfile.name || segment.speaker_name, emotion: segment.emotion || "neutral", castSlot: isNarration ? "narrator_main" : castEntry?.cast_slot || registryProfile.id || "unknown_01", pitchOffset: Number(castEntry?.pitch_offset || registryProfile.narrationOverrides?.pitchOffset || 0), rateOffset: Number(castEntry?.rate_offset || registryProfile.narrationOverrides?.rateOffset || 0), characterId: registryProfile.id, rate: registryProfile.rate, pitch: registryProfile.pitch, volume: registryProfile.volume, pauseScale: registryProfile.pauseScale })); }), [voiceSegments, castByCharacter, characterRegistry]);
  const directorSentences = useMemo(() => (directorPlan?.director_segment_settings || directorPlan?.segmentSettings || []).sort((a,b)=>Number(a.segment_index ?? a.segmentIndex)-Number(b.segment_index ?? b.segmentIndex)).flatMap((setting) => { const segment = voiceSegments.find((row) => Number(row.segment_index) === Number(setting.segment_index ?? setting.segmentIndex)); if (!segment) return []; return splitParagraphIntoSentences(segment.text || "").map((text) => ({ text, paragraphIndex: Number(setting.segment_index ?? setting.segmentIndex), voiceProfile: setting.voice_profile || setting.voiceProfile || segment.voice_profile || "unknown_neutral", speakerName: segment.speaker_name, emotion: setting.emotion, castSlot: setting.cast_slot || setting.castSlot || "unknown_01", pitchOffset: Number(setting.pitch ?? 0), rateOffset: Number(setting.rate ?? 1) - 1, pauseAfterMs: Number(setting.pause_after_ms ?? setting.pauseAfterMs ?? 0), sceneTitle: (directorPlan?.director_scenes || directorPlan?.scenes || []).find((scene) => Number(setting.segment_index ?? setting.segmentIndex) >= Number(scene.start_segment_index ?? scene.startSegmentIndex) && Number(setting.segment_index ?? setting.segmentIndex) <= Number(scene.end_segment_index ?? scene.endSegmentIndex))?.title })); }), [directorPlan, voiceSegments]);
  const sentences = useMemo(() => (directorPreview && directorSentences.length ? directorSentences : structuredPreview && structuredSentences.length ? structuredSentences : plainSentences), [directorPreview, directorSentences, plainSentences, structuredPreview, structuredSentences]);
  const currentDirectorPerformance = useMemo(() => directTextPerformance(sentences[currentSentenceIndex]?.text || "", { settings: narrationSettings.aiDirector2, speakerName: sentences[currentSentenceIndex]?.speakerName, segmentType: sentences[currentSentenceIndex]?.castSlot === "narrator_main" ? "narration" : sentences[currentSentenceIndex]?.castSlot ? "dialogue" : "narration" }), [currentSentenceIndex, narrationSettings.aiDirector2, sentences]);
  const narrationSupported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const estimatedTotalSeconds = useMemo(() => Math.max(1, Math.round(sentences.map((sentence) => sentence.text).join(" ").split(/\s+/).filter(Boolean).length / (165 * narrationSettings.rate) * 60 + sentences.length * narrationSettings.sentencePause / 1000)), [sentences, narrationSettings.rate, narrationSettings.sentencePause]);
  const elapsedSeconds = useMemo(() => Math.round((currentSentenceIndex / Math.max(1, sentences.length)) * estimatedTotalSeconds), [currentSentenceIndex, estimatedTotalSeconds, sentences.length]);
  const sentenceProgress = sentences.length ? Math.round(((currentSentenceIndex + (ttsActive ? 1 : 0)) / sentences.length) * 100) : 0;
  const chapterLanguage = useMemo(() => getVoiceLanguage(chapterContent), [chapterContent]);
  const rankedVoices = useMemo(() => [...voices].sort((a, b) => getVoiceScore(b, chapterLanguage) - getVoiceScore(a, chapterLanguage) || a.name.localeCompare(b.name)), [voices, chapterLanguage]);
  const selectedVoice = useMemo(() => rankedVoices.find((voice) => voice.voiceURI === narrationSettings.voiceURI) || rankedVoices[0] || null, [rankedVoices, narrationSettings.voiceURI]);
  const chapterRanges = useMemo(() => getChapterRanges(chapterList), [chapterList]);
  const currentRangeKey = useMemo(() => {
    return chapterRanges.find((range) => chapterNumber >= range.start && chapterNumber <= range.end)?.key || "";
  }, [chapterNumber, chapterRanges]);
  const aiAudioReady = aiAudio?.status === "ready" && Boolean(aiAudioUrl);
  const effectiveNarrationMode = [audioModes.cinematic, audioModes.ai].includes(narrationMode) && aiAudioReady ? audioModes.ai : audioModes.device;
  const aiAudioStatus = aiAudioLoading ? "loading" : aiAudio?.status || "unavailable";
  const aiWaveform = Array.isArray(aiAudio?.waveform) ? aiAudio.waveform : [];
  const currentSpeaker = sentences[currentSentenceIndex]?.speakerName || "Narrator";
  const currentCharacterId = sentences[currentSentenceIndex]?.characterId || "narrator";
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
    setAiAudio(null);
    setAiAudioUrl("");
    setVoiceSegments([]);
    setDirectorPlan(activeChapter.director_plan || null);
    setVoiceCast(activeChapter.voice_cast || []);
    setAiAudioDownloaded(localStorage.getItem(getAudioDownloadKey(activeChapter.id)) === "true");
    setAiAudioTime(Number(localStorage.getItem(getAudioPositionKey(activeChapter.id))) || 0);
    setChapter(activeChapter);
    const nextRegistry = buildPersistentCharacterRegistry({ novelId: activeChapter.novel_id, content: activeChapter.content, knownCharacters: activeChapter.characters || activeChapter.voice_characters || [] });
    setCharacterRegistry(nextRegistry);
    const [loadedVoiceSegments, loadedCast] = await Promise.all([
      data ? fetchChapterVoiceSegments(activeChapter.id) : Promise.resolve(activeChapter.voice_segments || []),
      data ? fetchNovelVoiceCast(activeChapter.novel_id) : Promise.resolve(activeChapter.voice_cast || []),
      loadAdjacentChapters(activeChapter),
      loadChapterMetadata(activeChapter),
    ]);
    setVoiceSegments(loadedVoiceSegments);
    setVoiceCast(loadedCast || []);
    const loadedDirectorPlan = data && loadedVoiceSegments.length ? await fetchReadyDirectorPlan(activeChapter.id, hashDirectorContent(loadedVoiceSegments)).catch(() => null) : activeChapter.director_plan || null;
    setDirectorPlan(loadedDirectorPlan);
    setStructuredPreview((enabled) => enabled && loadedVoiceSegments.length > 0);
    setDirectorPreview((enabled) => enabled && Boolean(loadedDirectorPlan));
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
    const key = userKey(user?.id, narrationSettingsKey);
    localStorage.setItem(key, JSON.stringify(narrationSettings));
    localStorage.setItem(narrationSettingsKey, JSON.stringify(narrationSettings));
    telegramCloudSetItem(`novelverse:${key}`, JSON.stringify(narrationSettings));
  }, [narrationSettings, user]);

  useEffect(() => {
    const key = userKey(user?.id, narrationSettingsKey);
    const cloudKey = `novelverse:${key}`;
    const saved = getNarrationSettings(key);
    setNarrationSettings(saved);
    telegramCloudGetItem(cloudKey).then((cloudSettings) => {
      if (cloudSettings) {
        localStorage.setItem(key, cloudSettings);
        setNarrationSettings(getNarrationSettings(key));
      }
    }).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    saveAudioMode(narrationMode);
  }, [narrationMode]);

  useEffect(() => {
    let cancelled = false;
    async function loadAudioMetadata() {
      if (!chapter) return;
      if (offlineMode) {
        const downloaded = await getDownloadedChapter(chapter.id);
        if (downloaded?.audio?.metadata && downloaded?.audio?.playback_url) {
          setAiAudio(downloaded.audio.metadata);
          setAiAudioUrl(downloaded.audio.playback_url);
        }
        return;
      }
      setAiAudioLoading(true);
      const result = await getChapterAudioMetadata(chapter.id, defaultAudioLanguage, defaultAudioVoice);
      if (cancelled) return;
      setAiAudio(result.audio);
      setAiAudioUrl(result.playbackUrl);
      setAiAudioLoading(false);
      if (!result.playbackUrl && [audioModes.cinematic, audioModes.ai].includes(narrationMode)) setAudioAnnouncement("Cinematic/Classic Audio unavailable. Device Voice fallback is ready.");
    }
    loadAudioMetadata();
    return () => { cancelled = true; };
  }, [chapter, offlineMode, narrationMode]);

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

  const stopAiAudio = useCallback(() => {
    const audio = aiAudioRef.current;
    if (audio) audio.pause();
    setAiAudioPlaying(false);
  }, []);

  const stopNarration = useCallback(() => {
    if (narrationSupported) { manuallyStoppingRef.current = true; window.speechSynthesis.cancel(); manuallyStoppingRef.current = false; }
    utteranceRef.current = null;
    setTtsActive(false);
    setTtsPaused(false);
    setSleepTimerMode("off");
    clearTimeout(sleepTimerRef.current);
    sleepTimerEndsAtRef.current = 0;
    stopAiAudio();
    stopLocalVoice();
    setAudioAnnouncement("Озвучення зупинено.");
  }, [narrationSupported, stopAiAudio, stopLocalVoice]);

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
      await saveDownloadedChapter({ ...chapter, audio: aiAudioReady ? { metadata: aiAudio, playback_url: aiAudioUrl, waveform: aiWaveform } : null, voice_cast: voiceCast.map((entry) => ({ character_id: entry.character_id, cast_slot: entry.cast_slot, voice_profile: entry.voice_profile, pitch_offset: entry.pitch_offset, rate_offset: entry.rate_offset, energy: entry.energy, roughness: entry.roughness, brightness: entry.brightness, stability: entry.stability, style_strength: entry.style_strength })), voice_segments: voiceSegments, director_plan: directorPlan }, chapter.novel || { id: chapter.novel_id });
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

  const handleChapterFinished = useCallback(() => {
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
  }, [adjacentChapters.next, narrationSettings.autoNextChapter, navigate]);

  const speakSentence = useCallback(function speakSentenceCallback(index = currentSentenceIndex, nextSettings = narrationSettings) {
    if (!chapter || !narrationSupported || !sentences.length) return;
    const safeIndex = Math.min(Math.max(index, 0), sentences.length - 1);
    const token = speechTokenRef.current + 1;
    speechTokenRef.current = token;
    manuallyStoppingRef.current = true;
    window.speechSynthesis.cancel();
    manuallyStoppingRef.current = false;
    const utterance = new SpeechSynthesisUtterance(sentences[safeIndex].text);
    utterance.lang = selectedVoice?.lang || getVoiceLanguage(sentences[safeIndex].text);
    let stableVoice = selectedVoice;
    if (structuredPreview && sentences[safeIndex].castSlot && rankedVoices.length) {
      const key = sentences[safeIndex].castSlot;
      if (!castVoiceMapRef.current.has(key) || !rankedVoices.some((voice) => voice.voiceURI === castVoiceMapRef.current.get(key)?.voiceURI)) {
        const offset = Math.abs([...key].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % rankedVoices.length;
        castVoiceMapRef.current.set(key, rankedVoices[offset]);
      }
      stableVoice = castVoiceMapRef.current.get(key) || selectedVoice;
    }
    utterance.voice = stableVoice;
    const profileSettings = (structuredPreview || directorPreview) ? getPreviewSettings(sentences[safeIndex].voiceProfile) : { pitch: 1, rate: 1 };
    const aiDirector = directTextPerformance(sentences[safeIndex].text, { settings: nextSettings.aiDirector2, speakerName: sentences[safeIndex].speakerName, segmentType: sentences[safeIndex].castSlot === "narrator_main" ? "narration" : sentences[safeIndex].castSlot ? "dialogue" : "narration" });
    const directorMultiplier = nextSettings.aiDirector2?.enabled === false ? { rate: 1, pitch: 1, volume: Number(sentences[safeIndex].volume || nextSettings.volume), pauseAfterMs: 0 } : aiDirector;
    utterance.rate = Math.min(3, Math.max(0.5, (profileSettings.rate + Number(sentences[safeIndex].rateOffset || 0)) * Number(sentences[safeIndex].rate || 1) * nextSettings.rate * directorMultiplier.rate));
    utterance.pitch = Math.min(2, Math.max(0, (profileSettings.pitch + Number(sentences[safeIndex].pitchOffset || 0)) * Number(sentences[safeIndex].pitch || 1) * nextSettings.pitch * directorMultiplier.pitch));
    utterance.volume = Math.min(1, Math.max(0, directorMultiplier.volume * Number(sentences[safeIndex].volume || nextSettings.volume)));
    utterance.onend = () => {
      if (manuallyStoppingRef.current || speechTokenRef.current !== token) return;
      if (safeIndex < sentences.length - 1) {
        const nextSentence = sentences[safeIndex + 1];
        const structuralPause = nextSentence?.paragraphIndex !== sentences[safeIndex].paragraphIndex ? nextSettings.paragraphPause : nextSettings.sentencePause;
        const plannedPause = Math.max(Number(sentences[safeIndex].pauseAfterMs || 0), directorMultiplier.pauseAfterMs || 0);
        const pauseMs = Math.min(6000, Math.max(plannedPause, structuralPause) * nextSettings.pauseLength * Number(sentences[safeIndex].pauseScale || 1));
        window.setTimeout(() => speakSentenceCallback(safeIndex + 1, nextSettings), pauseMs);
      }
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
    setAudioAnnouncement(`Озвучення: ${sentenceProgress}% глави · ${sentences[safeIndex].speakerName || "Narrator"}.`);
    window.speechSynthesis.speak(utterance);
  }, [chapter, currentSentenceIndex, narrationSettings, narrationSupported, rankedVoices, selectedVoice, sentenceProgress, sentences, structuredPreview, directorPreview, handleChapterFinished]);

  const pauseNarration = useCallback(() => {
    if (!narrationSupported) return;
    window.speechSynthesis.pause();
    setTtsPaused(true);
    setAudioAnnouncement("Озвучення призупинено.");
  }, [narrationSupported]);

  const resumeNarration = useCallback(() => {
    if (!narrationSupported) return;
    window.speechSynthesis.resume();
    setTtsActive(true);
    setTtsPaused(false);
  }, [narrationSupported]);

  const moveSentence = useCallback((direction) => {
    const target = Math.min(Math.max(currentSentenceIndex + direction, 0), Math.max(sentences.length - 1, 0));
    setCurrentSentenceIndex(target);
    if (ttsActive || ttsPaused) speakSentence(target);
  }, [currentSentenceIndex, sentences.length, speakSentence, ttsActive, ttsPaused]);

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
    const next = { ...narrationSettings, [key]: key === "rate" ? supportedRates.includes(Number(value)) ? Number(value) : defaultNarrationSettings.rate : value };
    if (key === "aiDirector2") saveAiDirector2Settings(value);
    setNarrationSettings(next);
    if (ttsActive || ttsPaused) setTimeout(() => speakSentence(currentSentenceIndex, next), 0);
  }

  function applyEmotionPreset(emotion) {
    const preset = emotionPresets[emotion] || emotionPresets.normal;
    const next = { ...narrationSettings, emotion, rate: preset.rate, pitch: preset.pitch, pauseLength: preset.pauseLength };
    setNarrationSettings(next);
    if (ttsActive || ttsPaused) setTimeout(() => speakSentence(currentSentenceIndex, next), 0);
  }

  const updateSleepTimer = useCallback((mode) => {
    setSleepTimerMode(mode);
    clearTimeout(sleepTimerRef.current);
    sleepTimerEndsAtRef.current = 0;
    const minutes = Number(mode);
    if (minutes > 0) {
      sleepTimerEndsAtRef.current = Date.now() + minutes * 60 * 1000;
      setSleepRemainingSeconds(minutes * 60);
      sleepTimerRef.current = setTimeout(() => stopNarration(), minutes * 60 * 1000);
    } else setSleepRemainingSeconds(0);
  }, [stopNarration]);



  useEffect(() => {
    const audio = aiAudioRef.current;
    if (!audio || !chapter) return undefined;
    function saveTime() {
      setAiAudioTime(audio.currentTime || 0);
      setAiAudioDuration(audio.duration || aiAudio?.duration_seconds || 0);
      localStorage.setItem(getAudioPositionKey(chapter.id), String(audio.currentTime || 0));
    }
    function onPlay() { setAiAudioPlaying(true); }
    function onPause() { setAiAudioPlaying(false); saveTime(); }
    function onEnded() { setAiAudioPlaying(false); localStorage.removeItem(getAudioPositionKey(chapter.id)); handleChapterFinished(); }
    audio.addEventListener("timeupdate", saveTime);
    audio.addEventListener("loadedmetadata", saveTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    if (aiAudioTime > 0 && Math.abs(audio.currentTime - aiAudioTime) > 2) audio.currentTime = aiAudioTime;
    return () => { audio.pause(); audio.removeEventListener("timeupdate", saveTime); audio.removeEventListener("loadedmetadata", saveTime); audio.removeEventListener("play", onPlay); audio.removeEventListener("pause", onPause); audio.removeEventListener("ended", onEnded); };
  }, [aiAudio?.duration_seconds, aiAudioTime, chapter, handleChapterFinished]);


  async function playLocalVoiceFromChunk(startIndex = 0) {
    if (!chapter) return;
    stopNarration();
    const chunks = (structuredPreview && sentences.length ? sentences.map((sentence) => sentence.text) : splitTextForVoiceWorker(stripReaderMarkup(chapter.content || "")));
    setLocalVoiceChunkTotal(chunks.length);
    if (!localVoiceStatus.online || !localVoiceStatus.piperAvailable) {
      setLocalVoiceError("Local Voice Worker or Piper is unavailable; using Device Voice fallback.");
      setNarrationOpen(true); setAudioReady(true); speakSentence(currentSentenceIndex); return;
    }
    if (!chunks.length) return;
    localVoiceStoppedRef.current = false;
    setNarrationOpen(true); setAudioReady(true); setLocalVoiceError(""); setLocalVoiceState("loading");
    for (let index = startIndex; index < chunks.length; index += 1) {
      if (localVoiceStoppedRef.current) return;
      setLocalVoiceChunkIndex(index);
      const controller = new AbortController();
      localVoiceAbortRef.current = controller;
      try {
        const sentenceProfile = resolveCharacterVoiceForSegment({ segment_type: sentences[index]?.characterId === "narrator" ? "narration" : "dialogue", characterId: sentences[index]?.characterId, speakerName: sentences[index]?.speakerName }, characterRegistry);
        const assignment = assignVoiceToProfile(sentenceProfile, localVoiceStatus.voices || []);
        const aiDirector = directTextPerformance(chunks[index], { settings: narrationSettings.aiDirector2, speakerName: sentences[index]?.speakerName });
        const result = await synthesizeVoiceWorkerAudio({ text: chunks[index], provider: assignment.provider, voice: assignment.voice || defaultPiperVoiceId, language: "uk", format: "wav", signal: controller.signal, options: { rate: narrationSettings.rate * aiDirector.rate, pitch: narrationSettings.pitch * aiDirector.pitch, volume: narrationSettings.volume * aiDirector.volume, pauseLength: narrationSettings.pauseLength, sentencePause: Math.max(narrationSettings.sentencePause, aiDirector.pauseAfterMs), paragraphPause: narrationSettings.paragraphPause, emotion: sentences[index]?.emotion || narrationSettings.emotion, characterId: sentenceProfile.id, speaker: sentenceProfile.name, aiDirector2: aiDirector } });
        if (localVoiceStoppedRef.current) return;
        revokeLocalAudioUrl();
        localAudioUrlRef.current = URL.createObjectURL(result.blob);
        const audio = new Audio(localAudioUrlRef.current);
        localAudioRef.current = audio;
        setLocalVoiceState("playing");
        await new Promise((resolve, reject) => { audio.onended = resolve; audio.onerror = () => reject(new Error("Local Piper audio playback failed")); audio.play().catch(reject); });
      } catch (error) {
        if (controller.signal.aborted || localVoiceStoppedRef.current) return;
        setLocalVoiceState("error"); setLocalVoiceError(`${error.message || "Local Piper synthesis failed"}. Device Voice fallback remains available.`); return;
      } finally { localVoiceAbortRef.current = null; }
    }
    setLocalVoiceState("idle"); setAudioAnnouncement("Локальне Piper озвучення глави завершено."); handleChapterFinished();
  }

  useEffect(() => {
    if (localVoiceState !== "playing") return;
    playLocalVoiceFromChunk(localVoiceChunkIndex);
  }, [narrationSettings.rate, narrationSettings.pitch, narrationSettings.volume, narrationSettings.pauseLength, narrationSettings.sentencePause, narrationSettings.paragraphPause, narrationSettings.emotion, narrationSettings.aiDirector2]);

  function retryLocalVoice() { playLocalVoiceFromChunk(localVoiceChunkIndex); }

  function toggleAiAudio() {
    const audio = aiAudioRef.current;
    if (!audio || !aiAudioReady) {
      setNarrationMode(audioModes.device);
      setAudioAnnouncement("AI Audio unavailable. Switched to Device Voice.");
      return;
    }
    if (narrationSupported) window.speechSynthesis.cancel();
    if (audio.paused) audio.play().catch(() => setAudioAnnouncement("AI Audio playback was blocked. Tap play again or use Device Voice."));
    else audio.pause();
  }

  function seekAiAudio(value) {
    const audio = aiAudioRef.current;
    if (!audio) return;
    audio.currentTime = Number(value) || 0;
    setAiAudioTime(audio.currentTime);
  }

  function updateAiAudioRate(value) {
    const rate = supportedRates.includes(Number(value)) ? Number(value) : 1;
    updateNarrationSetting("rate", rate);
    if (aiAudioRef.current) aiAudioRef.current.playbackRate = rate;
  }

  async function downloadAiAudio() {
    if (!aiAudioReady) { setAudioAnnouncement("AI Audio is unavailable for download."); return; }
    await saveDownloadedChapter({ ...chapter, audio: { metadata: aiAudio, playback_url: aiAudioUrl, waveform: aiWaveform }, voice_cast: voiceCast, voice_segments: voiceSegments, director_plan: directorPlan }, chapter.novel || { id: chapter.novel_id });
    localStorage.setItem(getAudioDownloadKey(chapter.id), "true");
    setAiAudioDownloaded(true);
    setAudioAnnouncement("AI Audio downloaded with this chapter for offline playback when browser storage permits.");
  }

  function removeAiAudioDownload() {
    localStorage.removeItem(getAudioDownloadKey(chapter.id));
    setAiAudioDownloaded(false);
    setAudioAnnouncement("Downloaded AI Audio removed from this device.");
  }

  useEffect(() => {
    if (!pendingAutoplayRef.current || loading || !chapter || !sentences.length || !narrationSupported) return;
    pendingAutoplayRef.current = false;
    setAudioReady(true);
    setNarrationOpen(true);
    speakSentence(0);
  }, [chapter, loading, narrationSupported, sentences.length, speakSentence]);

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
  }, [chapter, currentSentenceIndex, moveSentence, pauseNarration, resumeNarration, speakSentence, ttsActive, ttsPaused]);

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

  function updateCharacterVoice(characterId, patch) {
    if (!chapter) return;
    setCharacterRegistry(updateCharacterProfile(chapter.novel_id, characterId, patch));
    setStructuredPreview(true);
  }

  if (loading) return <main className="reader reader--dark"><div className="reader__shell"><div className="skeleton reader__skeleton" /></div></main>;
  if (errorMessage) return <main className="reader reader--dark"><div className="reader__shell"><div className="error-state">{errorMessage}</div></div></main>;

  return (
    <main className={`reader reader--${settings.theme} ${controlsVisible ? "reader--controls-visible" : "reader--immersive"}`}>
      <button className="reader__settings-toggle" onClick={() => setSettingsOpen(true)} aria-expanded={settingsOpen} aria-controls="reader-settings-panel">⚙️<span>Налаштування</span></button>
      <button className="reader__audio-toggle" onClick={() => narrationOpen ? setNarrationOpen(false) : openAudioPlayer()} aria-expanded={narrationOpen} aria-controls="reader-narration-panel">🔊<span>Аудіо</span></button><button className="reader__audio-toggle reader__audio-toggle--piper" onClick={() => setCharacterStudioOpen(true)}>🎭<span>Voices</span></button><button className="reader__audio-toggle reader__audio-toggle--piper" onClick={() => playLocalVoiceFromChunk(0)} disabled={localVoiceState === "loading" || localVoiceState === "playing"}>🎙️<span>Озвучити</span></button>
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

      {characterStudioOpen && <div className="reader__settings-scrim" onClick={() => setCharacterStudioOpen(false)} />}
      <section className={`reader__settings ${characterStudioOpen ? "reader__settings--open" : ""}`} aria-label="Character Voice Studio" aria-hidden={!characterStudioOpen}>
        <div className="reader__settings-header"><h2>🎭 Character Voice Studio</h2><button onClick={() => setCharacterStudioOpen(false)} aria-label="Close Character Voice Studio">✕</button></div>
        <p className="reader__narration-status">Persistent v2 registry saved by novel. Narration always uses the narrator profile; dialogue uses stable character ids and per-utterance emotion.</p>
        <button type="button" onClick={() => { if (chapter) setCharacterRegistry(buildPersistentCharacterRegistry({ novelId: chapter.novel_id, content: chapter.content, existingRegistry: characterRegistry })); }}>Re-detect characters</button>
        {characterRegistry.characters.map((character) => (
          <div className="reader__character-studio-row" key={character.id}>
            <strong>{character.name}</strong>
            <label>Gender<select value={character.gender} onChange={(e) => updateCharacterVoice(character.id, { gender: e.target.value })}><option value="unknown">unknown</option><option value="male">male</option><option value="female">female</option></select></label>
            <label>Age<select value={character.ageCategory} onChange={(e) => updateCharacterVoice(character.id, { ageCategory: e.target.value })}><option value="unknown">unknown</option><option value="child">child</option><option value="teen">teen</option><option value="young-adult">young-adult</option><option value="adult">adult</option><option value="elderly">elderly</option></select></label>
            <label>Role<select value={character.role} onChange={(e) => updateCharacterVoice(character.id, { role: e.target.value })}><option value="narrator">narrator</option><option value="protagonist">protagonist</option><option value="supporting">supporting</option><option value="minor">minor</option><option value="creature">creature</option><option value="unknown">unknown</option></select></label>
            <label>Aliases<input value={(character.aliases || []).join(", ")} onChange={(e) => updateCharacterVoice(character.id, { aliases: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
            <label>Voice<select value={character.voiceId} onChange={(e) => updateCharacterVoice(character.id, { voiceId: e.target.value })}>{voiceProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.label}</option>)}</select></label>
            <label>Rate<input type="number" min="0.5" max="2" step="0.05" value={character.rate || 1} onChange={(e) => updateCharacterVoice(character.id, { rate: Number(e.target.value) })} /></label>
            <label>Pitch<input type="number" min="0" max="2" step="0.05" value={character.pitch || 1} onChange={(e) => updateCharacterVoice(character.id, { pitch: Number(e.target.value) })} /></label>
            <label>Volume<input type="number" min="0" max="1" step="0.05" value={character.volume || 1} onChange={(e) => updateCharacterVoice(character.id, { volume: Number(e.target.value) })} /></label>
            <label><input type="checkbox" checked={character.manualLock} onChange={(e) => updateCharacterVoice(character.id, { manualLock: e.target.checked })} /> Manual lock</label>
            <button type="button" onClick={() => speakSentence(sentences.findIndex((sentence) => sentence.characterId === character.id) >= 0 ? sentences.findIndex((sentence) => sentence.characterId === character.id) : currentSentenceIndex)}>Preview</button>
            <button type="button" onClick={() => setCharacterRegistry(resetCharacterToAutomatic(chapter.novel_id, character.id))} disabled={character.id === "narrator"}>Reset auto</button>
            {character.id !== "narrator" && <button type="button" onClick={() => { const duplicate = characterRegistry.characters.find((item) => item.id !== character.id && item.id !== "narrator"); if (duplicate) setCharacterRegistry(mergeCharacterAliases(chapter.novel_id, character.id, duplicate.id)); }}>Merge next duplicate</button>}
          </div>
        ))}
      </section>
      <section id="reader-narration-panel" className={`reader__narration-player ${narrationOpen ? "reader__narration-player--open" : ""} ${playerExpanded ? "reader__narration-player--expanded" : "reader__narration-player--mini"}`} aria-label="Озвучення глави" aria-hidden={!narrationOpen}>
        <button className="reader__player-grip" onClick={() => setPlayerExpanded((expanded) => !expanded)} aria-label={playerExpanded ? "Згорнути аудіоплеєр" : "Розгорнути аудіоплеєр"} />
        <div className="reader__player-header"><button className="reader__player-collapse" onClick={() => setPlayerExpanded((expanded) => !expanded)}>{playerExpanded ? "⌄" : "⌃"}</button><div><p>{chapter.novel?.title || chapter.novel_title || "NovelVerse"}</p><strong>Глава {chapter.number}: {chapter.title}</strong><div className="reader__mode-tabs"><button className={narrationMode === audioModes.cinematic ? "reader__mode-tab reader__mode-tab--active" : "reader__mode-tab"} onClick={() => setNarrationMode(audioModes.cinematic)}>Cinematic Audio</button><button className={narrationMode === audioModes.ai ? "reader__mode-tab reader__mode-tab--active" : "reader__mode-tab"} onClick={() => setNarrationMode(audioModes.ai)}>Classic Audio</button><button className={narrationMode === audioModes.device ? "reader__mode-tab reader__mode-tab--active" : "reader__mode-tab"} onClick={() => setNarrationMode(audioModes.device)}>Device Voice</button></div></div><button onClick={() => { stopNarration(); setNarrationOpen(false); }} aria-label="Закрити озвучення">✕</button></div>
        {effectiveNarrationMode === audioModes.ai && aiAudioReady ? (
          <>
            <audio ref={aiAudioRef} src={aiAudioUrl} preload="metadata" />
            <div className="reader__waveform" aria-label="AI Audio waveform">{aiWaveform.length ? aiWaveform.map((value, index) => <button key={`${index}-${value}`} type="button" style={{ height: `${Math.max(10, Math.round(Number(value) * 42))}px` }} onClick={() => seekAiAudio(((aiAudioDuration || aiAudio?.duration_seconds || 0) * index) / Math.max(1, aiWaveform.length - 1))} aria-label={`Seek to waveform point ${index + 1}`} />) : <span>No waveform available</span>}</div>
            <input className="reader__progress-slider" type="range" min="0" max={Math.max(aiAudioDuration || aiAudio?.duration_seconds || 0, 0)} step="0.1" value={Math.min(aiAudioTime, aiAudioDuration || aiAudio?.duration_seconds || 0)} onChange={(e) => seekAiAudio(e.target.value)} aria-label="AI Audio progress" />
            <div className="reader__player-time"><span>{formatClock(aiAudioTime)}</span><span>{narrationMode === audioModes.cinematic ? "Cinematic Audio" : "Classic Audio"} · {aiAudioPlaying ? "Playing" : "Ready"} {aiAudioDownloaded ? "· Downloaded" : ""}</span><span>{formatClock(aiAudioDuration || aiAudio?.duration_seconds)}</span></div>
            <div className="reader__player-meta"><span>Status: ready</span><span>Voice: {aiAudio.voice_id}</span><span>Language: {aiAudio.language}</span><span>Provider: {aiAudio.provider}</span><span>Render: {aiAudio.render_version || "legacy"}</span><span>{aiAudio.sample_rate ? `${aiAudio.sample_rate} Hz` : "Sample rate —"}</span><span>{aiAudio.bitrate ? `${Math.round(aiAudio.bitrate / 1000)} kbps` : "Bitrate —"}</span><span>Size: {formatFileSize(aiAudio.file_size)}</span></div>
            <div className="reader__media-controls">
              <button onClick={previousChapter} disabled={navigatingChapter || !adjacentChapters.previous} aria-label="Попередня глава">⏪</button>
              <button className="reader__play-button" onClick={toggleAiAudio} aria-label="Відтворити або пауза">{aiAudioPlaying ? "⏸" : "▶"}</button>
              <button onClick={nextChapter} disabled={navigatingChapter || !adjacentChapters.next} aria-label="Наступна глава">⏩</button>
              <button onClick={stopAiAudio} disabled={!aiAudioPlaying} aria-label="Зупинити">⏹</button>
            </div>
            <div className="reader__speed-row"><label>Speed<select value={narrationSettings.rate} onChange={(e) => updateAiAudioRate(e.target.value)}>{supportedRates.map((rate) => <option value={rate} key={rate}>{rate}x</option>)}</select></label></div>
            <details className="reader__player-settings" open={playerExpanded}><summary>AI Audio options</summary><label><input type="checkbox" checked={narrationSettings.autoNextChapter} onChange={(e) => updateNarrationSetting("autoNextChapter", e.target.checked)} /> Auto next chapter</label><button type="button" onClick={aiAudioDownloaded ? removeAiAudioDownload : downloadAiAudio}>{aiAudioDownloaded ? "Remove downloaded AI audio" : `Download AI audio (${formatFileSize(aiAudio.file_size)})`}</button><p className="reader__narration-status">Cinematic Audio uses layered scene mixes when available. Classic Audio uses stored narration MP3 files. Device Voice remains the fallback when files are unavailable or offline.</p></details>
          </>
        ) : !narrationSupported ? (
          <p className="reader__narration-warning">Озвучення недоступне у цьому браузері. AI Audio: {aiAudioStatus}. Device Voice requires SpeechSynthesis.</p>
        ) : (
          <>
            <p className="reader__narration-status">Local Piper: {localVoiceStatus.loading ? "checking…" : localVoiceStatus.piperAvailable ? "ready" : "unavailable"} · chunk {Math.min(localVoiceChunkIndex + 1, localVoiceChunkTotal || 1)}/{localVoiceChunkTotal || 1} · {localVoiceState}. {localVoiceError}</p><div className="reader__media-controls"><button type="button" onClick={() => playLocalVoiceFromChunk(0)} disabled={localVoiceState === "loading" || localVoiceState === "playing"}>Озвучити</button><button type="button" onClick={stopLocalVoice} disabled={localVoiceState !== "loading" && localVoiceState !== "playing"}>Stop Piper</button><button type="button" onClick={retryLocalVoice} disabled={localVoiceState !== "error"}>Retry Piper</button></div><p className="reader__narration-status">Cinematic/Classic Audio: {offlineMode ? "offline unavailable" : aiAudioStatus === "ready" ? "ready" : aiAudioStatus}. {narrationMode !== audioModes.device ? "Using Device Voice fallback." : "Device Voice selected."}</p>
            <input className="reader__progress-slider" type="range" min="0" max={Math.max(sentences.length - 1, 0)} value={currentSentenceIndex} onChange={(e) => scrubNarration(e.target.value)} disabled={!sentences.length} aria-label="Прогрес озвучення" />
            <div className="reader__player-time"><span>{formatClock(elapsedSeconds)}</span><span>{sentenceProgress}% · {ttsActive && !ttsPaused ? "Playing" : ttsPaused ? "Paused" : "Ready"}</span><span>{formatClock(estimatedTotalSeconds)}</span></div><div className="reader__player-meta"><span>Speaker: {currentSpeaker} ({currentCharacterId})</span><span>Voice: {selectedVoice ? `${selectedVoice.name} (${selectedVoice.lang})` : "Best available voice"}</span><span>Speed: {narrationSettings.rate}x</span><span>Pitch: {narrationSettings.pitch}x</span><span>Emotion: {emotionPresets[narrationSettings.emotion]?.label}</span></div>
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
            <div className="reader__speed-row"><label>Speed<select value={narrationSettings.rate} onChange={(e) => updateNarrationSetting("rate", Number(e.target.value))}>{supportedRates.map((rate) => <option value={rate} key={rate}>{rate}x</option>)}</select></label><label>Emotion<select value={narrationSettings.emotion} onChange={(e) => applyEmotionPreset(e.target.value)}>{Object.entries(emotionPresets).map(([key, preset]) => <option value={key} key={key}>{preset.label}</option>)}</select></label></div>
            <details className="reader__player-settings" open={playerExpanded}><summary>Voice & sleep timer</summary><label><input type="checkbox" checked={structuredPreview} onChange={(e) => setStructuredPreview(e.target.checked)} disabled={!voiceSegments.length} /> Structured Voice Engine preview ({voiceSegments.length || "no"} segments)</label><label><input type="checkbox" checked={directorPreview} onChange={(e) => setDirectorPreview(e.target.checked)} disabled={!directorPlan} /> Director Preview timing plan {directorPlan ? "ready" : "missing"}</label><label><input type="checkbox" checked={narrationSettings.autoNextChapter} onChange={(e) => updateNarrationSetting("autoNextChapter", e.target.checked)} /> Auto next chapter</label><label>Sleep timer <select value={sleepTimerMode} onChange={(e) => updateSleepTimer(e.target.value)}><option value="off">Вимкнено</option><option value="15">15 хв</option><option value="30">30 хв</option><option value="60">60 хв</option></select></label>{sleepRemainingSeconds > 0 && <p className="reader__narration-status">Таймер сну: {formatClock(sleepRemainingSeconds)}</p>}<label>Голос <select value={narrationSettings.voiceURI} onChange={(e) => updateNarrationSetting("voiceURI", e.target.value)}><option value="">Best available voice</option>{rankedVoices.map((voice) => <option value={voice.voiceURI} key={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}</select></label><p className="reader__narration-status">Voice quality depends on voices installed on your device and browser. Structured preview only approximates profile pitch and rate, not custom timbre.</p><p className="reader__narration-status">{offlineMode ? "Офлайн: озвучення працює з завантаженим текстом, якщо WebView підтримує SpeechSynthesis." : "Онлайн: використовується браузерний SpeechSynthesis без платних TTS API."}</p><button type="button" onClick={cacheSpokenChapter}>{audioCacheState === "cached" ? "Аудіо-кеш готовий" : audioCacheState === "error" ? "Кеш недоступний" : "Кешувати озвучення"}</button><label>Pitch <input type="range" min="0" max="2" step="0.05" value={narrationSettings.pitch} onChange={(e) => updateNarrationSetting("pitch", Number(e.target.value))} /></label><label>AI Director 2.0 preset <select value={narrationSettings.aiDirector2?.preset || "audiobook"} onChange={(e) => updateNarrationSetting("aiDirector2", saveAiDirector2Settings({ ...narrationSettings.aiDirector2, preset: e.target.value }))}>{Object.entries(narrationPresets).map(([key, preset]) => <option value={key} key={key}>{preset.label}</option>)}</select></label><label><input type="checkbox" checked={narrationSettings.aiDirector2?.enabled !== false} onChange={(e) => updateNarrationSetting("aiDirector2", saveAiDirector2Settings({ ...narrationSettings.aiDirector2, enabled: e.target.checked }))} /> AI Director 2.0 professional audiobook performance</label><label><input type="checkbox" checked={narrationSettings.aiDirector2?.cinematicPauses !== false} onChange={(e) => updateNarrationSetting("aiDirector2", saveAiDirector2Settings({ ...narrationSettings.aiDirector2, cinematicPauses: e.target.checked }))} /> Cinematic comma, period, paragraph and scene pauses</label><p className="reader__narration-status">Live preview: {currentDirectorPerformance.preset} · rate {currentDirectorPerformance.rate}x · pitch {currentDirectorPerformance.pitch}x · volume {currentDirectorPerformance.volume} · pause {currentDirectorPerformance.pauseAfterMs}ms · {Object.entries(currentDirectorPerformance.traits).filter(([, enabled]) => enabled).map(([trait]) => trait).join(", ") || "narration"}</p><label>Current character rate <input type="range" min="0.5" max="1.5" step="0.05" value={narrationSettings.aiDirector2?.characterOverrides?.[sentences[currentSentenceIndex]?.speakerName]?.rate || 1} onChange={(e) => { const speaker = sentences[currentSentenceIndex]?.speakerName || "Narrator"; updateNarrationSetting("aiDirector2", saveAiDirector2Settings({ ...narrationSettings.aiDirector2, characterOverrides: { ...narrationSettings.aiDirector2?.characterOverrides, [speaker]: { ...narrationSettings.aiDirector2?.characterOverrides?.[speaker], rate: Number(e.target.value) } } })); }} /></label><label>Pause length <input type="range" min="0" max="2.5" step="0.1" value={narrationSettings.pauseLength} onChange={(e) => updateNarrationSetting("pauseLength", Number(e.target.value))} /></label><label>Sentence pause <input type="range" min="0" max="3000" step="50" value={narrationSettings.sentencePause} onChange={(e) => updateNarrationSetting("sentencePause", Number(e.target.value))} /></label><label>Paragraph pause <input type="range" min="0" max="6000" step="100" value={narrationSettings.paragraphPause} onChange={(e) => updateNarrationSetting("paragraphPause", Number(e.target.value))} /></label><label>Volume <input type="range" min="0" max="1" step="0.05" value={narrationSettings.volume} onChange={(e) => updateNarrationSetting("volume", Number(e.target.value))} /></label></details>
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
