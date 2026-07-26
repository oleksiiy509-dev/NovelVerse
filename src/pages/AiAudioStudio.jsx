import { useEffect, useMemo, useRef, useState } from "react";
import { AudioRenderQueue, applyClipRenderState, buildChapterPlaybackManifest, loadRenderJob, revokeClipObjectUrl } from "../lib/audioRenderingPipeline";
import { createAudioStudioProject, createAudioStudioProjectFromChapter, deserializeAudioStudioProject, fetchAudioStudioChapters, fetchAudioStudioChapterText, fetchAudioStudioNovels, getProjectStorageKey, hasChapterText, loadAudioStudioProject, mergeManualEdits, mixPreviewSummary, productionProgressStates, saveAudioStudioProject, serializeAudioStudioProject, updateClip, updateScene } from "../lib/aiAudioStudio";
import { supabase } from "../lib/supabase";
import "../styles/AiAudioStudio.css";

const storageKey = "novelverse.aiAudioStudio.v1";

function AiAudioStudio() {
  const [project, setProject] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? deserializeAudioStudioProject(saved) : createAudioStudioProject();
  });
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [status, setStatus] = useState("Loaded");
  const [novels, setNovels] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [selectedNovelId, setSelectedNovelId] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [loadingError, setLoadingError] = useState("");
  const [progressState, setProgressState] = useState("completed");
  const fileRef = useRef(null);
  const renderQueueRef = useRef(null);
  const playbackRef = useRef({ audio: null, urls: [] });
  const [renderJob, setRenderJob] = useState(null);
  const [renderStats, setRenderStats] = useState({ cacheHitCount: 0, failedClipCount: 0, startedAt: 0, currentClip: null });
  const [renderClock, setRenderClock] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState("");
  const activeClip = project.tracks[0]?.clips[0];
  const preview = useMemo(() => mixPreviewSummary(project, project.cursor), [project]);
  const manifest = useMemo(() => buildChapterPlaybackManifest(project), [project]);
  const selectedClip = useMemo(() => project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedClipId) || activeClip, [project, selectedClipId, activeClip]);

  useEffect(() => { fetchAudioStudioNovels(supabase).then(setNovels).catch((error) => setLoadingError(error.message || "Supabase request failed.")); }, []);
  useEffect(() => {
    const id = setTimeout(() => {
      setRenderJob(loadRenderJob({ projectId: project.id || project.projectId, novelId: project.novelId, chapterId: project.chapterId }));
    }, 0);
    return () => clearTimeout(id);
  }, [project.id, project.projectId, project.novelId, project.chapterId]);
  useEffect(() => () => { renderQueueRef.current?.cancel(); playbackRef.current.audio?.pause(); playbackRef.current.urls.forEach((url) => URL.revokeObjectURL(url)); }, []);

  useEffect(() => {
    if (!renderStats.startedAt) return undefined;
    const id = setInterval(() => setRenderClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, [renderStats.startedAt]);

useEffect(() => {
  let cancelled = false;

  const timeoutId = window.setTimeout(() => {
    if (!selectedNovelId) {
      if (!cancelled) {
        setChapters([]);
      }

      return;
    }

    fetchAudioStudioChapters(supabase, selectedNovelId)
      .then((items) => {
        if (!cancelled) {
          setChapters(items);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadingError(
            error.message || 'Supabase request failed.'
          );
        }
      });
  }, 0);

  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
}, [selectedNovelId]);

  useEffect(() => {
    const id = setTimeout(() => {
      saveAudioStudioProject(project);
      setStatus(`Auto-saved ${new Date().toLocaleTimeString()}`);
    }, 350);
    return () => clearTimeout(id);
  }, [project]);

  function commit(next) {
    setHistory((items) => [...items.slice(-24), project]);
    setFuture([]);
    setProject(next);
  }

  function editClip(trackId, clipId, patch) {
    commit(updateClip(project, trackId, clipId, patch));
  }

  function undo() {
    setHistory((items) => {
      if (!items.length) return items;
      const previous = items[items.length - 1];
      setFuture((redoItems) => [project, ...redoItems]);
      setProject(previous);
      return items.slice(0, -1);
    });
  }

  async function generateProductionTimeline({ forceOverwrite = false, preserveManualEdits = true } = {}) {
    try {
      setLoadingError("");
      if (!selectedNovelId || !selectedChapterId) throw new Error("Select a novel and chapter first.");
      const existing = loadAudioStudioProject(selectedNovelId, selectedChapterId);
      if (existing?.tracks?.some((track) => track.clips?.some((clip) => clip.manuallyEdited)) && !forceOverwrite && !window.confirm("An edited project already exists. Preserve manual edits while regenerating? Choose Cancel to stop.")) return;
      setProgressState("loading chapter");
      const chapter = await fetchAudioStudioChapterText(supabase, selectedChapterId);
      setProgressState("analyzing text");
      await Promise.resolve();
      setProgressState("detecting scenes");
      await Promise.resolve();
      setProgressState("resolving speakers");
      const next = createAudioStudioProjectFromChapter({ ...chapter, novelId: chapter.novel_id || selectedNovelId, content: chapter.content ?? chapter.text }, { novelId: selectedNovelId });
      setProgressState("building tracks");
      const merged = mergeManualEdits(next, existing, { preserveManualEdits });
      setProgressState("saving project");
      saveAudioStudioProject(merged);
      commit(merged);
      setProgressState("completed");
      setStatus("Generated production timeline; audio synthesis remains manual.");
    } catch (error) {
      setProgressState("failed");
      setLoadingError(error.message || "Timeline generation failed.");
    }
  }


  function updateRenderedClip(clip, result) {
    if (!result?.audio?.blob) return;
    setProject((current) => {
      const old = current.tracks.flatMap((track) => track.clips).find((item) => item.id === clip.id);
      revokeClipObjectUrl(old);
      const audioUrl = URL.createObjectURL(result.audio.blob);
      playbackRef.current.urls.push(audioUrl);
      return applyClipRenderState(current, clip.id, { state: "rendered", audioUrl, audioContentType: result.audio.contentType, audioCacheHash: result.hash, cached: Boolean(result.cached), renderedAt: new Date().toISOString(), renderError: "" });
    });
  }

  async function startRender(options = {}) {
    const startedAt = Date.now();
    const queue = new AudioRenderQueue({ project, onUpdate: ({ job, clip, result }) => {
      if (job) setRenderJob(job);
      if (clip) setRenderStats((stats) => ({ ...stats, cacheHitCount: stats.cacheHitCount + (result?.cached ? 1 : 0), failedClipCount: job?.failedClipIds?.length || stats.failedClipCount, currentClip: clip, startedAt: stats.startedAt || Date.now() }));
      if (clip && result?.status === "rendered") updateRenderedClip(clip, result);
      if (clip && ["failed", "cancelled", "skipped"].includes(result?.status)) setProject((current) => applyClipRenderState(current, clip.id, { state: result.status, renderError: result.error || result.reason || "" }));
    }, maxRetryCount: Number(project.maxRetryCount ?? 2) });
    renderQueueRef.current = queue;
    setRenderClock(startedAt);
    setRenderStats({ cacheHitCount: 0, failedClipCount: 0, startedAt, currentClip: null });
    await queue.render(options);
  }
  function pauseRender() { renderQueueRef.current?.pause(); setRenderJob((job) => job ? { ...job, status: "paused" } : job); }
  function resumeRender() { renderQueueRef.current?.resume(); setRenderJob((job) => job ? { ...job, status: "rendering" } : job); }
  function cancelRender() { renderQueueRef.current?.cancel(); }
  function deleteClipAudio(clipId) { const clip = project.tracks.flatMap((track) => track.clips).find((item) => item.id === clipId); revokeClipObjectUrl(clip); commit(applyClipRenderState(project, clipId, { state: "not_rendered", audioUrl: "", audioCacheHash: "", cached: false })); }
  async function playRenderedFrom(clipId = null) {
    const items = manifest.items.filter((item, index) => !clipId || index >= manifest.items.findIndex((x) => x.clipId === clipId && x.type === "speech"));
    for (const item of items) {
      if (item.type === "silence") await new Promise((resolve) => setTimeout(resolve, item.duration));
      if (item.type === "speech") { if (!item.audioUrl) { setStatus(`Playback stopped: missing audio for ${item.clipId}`); break; } const audio = new Audio(item.audioUrl); playbackRef.current.audio = audio; await audio.play().catch((error) => { throw new Error(`browser playback failure: ${error.message}`); }); await new Promise((resolve) => { audio.onended = resolve; audio.onerror = resolve; }); }
    }
  }

  function redo() {
    setFuture((items) => {
      if (!items.length) return items;
      const next = items[0];
      setHistory((undoItems) => [...undoItems, project]);
      setProject(next);
      return items.slice(1);
    });
  }

  function exportJson() {
    const blob = new Blob([serializeAudioStudioProject(project)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/\W+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    commit(deserializeAudioStudioProject(await file.text()));
    setStatus(`Imported ${file.name}`);
    event.target.value = "";
  }

  return <main className="audio-studio"><header className="studio-hero"><div><p className="eyebrow">AI Audio Studio v1</p><h1>Complete audiobook production interface</h1><p>Layer narration, cast voices, ambience, music and sound effects with non-destructive automation.</p></div><div className="studio-actions"><button onClick={undo} disabled={!history.length}>Undo</button><button onClick={redo} disabled={!future.length}>Redo</button><button onClick={exportJson}>Export project JSON</button><button onClick={() => fileRef.current?.click()}>Import project JSON</button><input ref={fileRef} hidden type="file" accept="application/json" onChange={importJson} /></div></header>
    <section className="studio-panel"><h2>Production source</h2>{loadingError && <p className="admin-toast">{loadingError}</p>}<div className="editor-row"><label>Novel<select value={selectedNovelId} onChange={(e) => { setSelectedNovelId(e.target.value); setSelectedChapterId(""); }}><option value="">Select novel</option>{novels.map((novel) => <option key={novel.id} value={novel.id}>{novel.title}</option>)}</select></label><label>Chapter<select value={selectedChapterId} onChange={(e) => setSelectedChapterId(e.target.value)} disabled={!selectedNovelId}><option value="">Select chapter</option>{chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>Chapter {chapter.number}: {chapter.title || "Untitled"} — {hasChapterText(chapter) ? "text available" : "no text"}</option>)}</select></label><button onClick={() => generateProductionTimeline()}>Generate Production Timeline</button><button onClick={() => generateProductionTimeline({ forceOverwrite: true, preserveManualEdits: false })}>Regenerate whole project</button></div><p>Progress: {progressState}</p><p>States: {productionProgressStates.join(" → ")}</p><p>Project key: {selectedNovelId && selectedChapterId ? getProjectStorageKey(selectedNovelId, selectedChapterId) : "Select a chapter"}</p>{!novels.length && <p className="empty-state">No novels found.</p>}{selectedNovelId && !chapters.length && <p className="empty-state">No chapters found for this novel.</p>}</section>
    <section className="transport"><button onClick={() => setProject({ ...project, cursor: Math.max(0, project.cursor - 5) })}>⏪</button><button onClick={() => setStatus("Live preview playing")}>▶ Live preview</button><button onClick={() => playRenderedFrom(selectedClip?.id)}>▶ Rendered playback</button><button onClick={() => setProject({ ...project, cursor: Math.min(project.duration, project.cursor + 5) })}>⏩</button><label>Cursor <input type="range" min="0" max={project.duration} value={project.cursor} onChange={(e) => setProject({ ...project, cursor: Number(e.target.value) })} /></label><strong>{project.cursor}s</strong><span>{status}</span></section>
    <section className="studio-panel render-panel"><h2>Audio Rendering Pipeline v1</h2><div className="studio-actions"><button onClick={() => startRender()}>Start Render</button><button onClick={pauseRender}>Pause Render</button><button onClick={resumeRender}>Resume Render</button><button onClick={cancelRender}>Cancel Render</button><button onClick={() => startRender({ retryFailedOnly: true })}>Retry Failed Clips</button><button onClick={() => startRender({ clipIds: project.tracks.flatMap((t) => t.clips).filter((c) => c.sceneId === selectedClip?.sceneId).map((c) => c.id) })}>Render Selected Scene</button><button onClick={() => selectedClip && startRender({ clipIds: [selectedClip.id] })}>Render Selected Clip</button></div><p>Overall: {renderJob?.progressPercent || 0}% · {renderJob?.completedClipIds?.length || 0}/{renderJob?.totalClips || manifest.items.filter((i) => i.type === "speech").length} clips · Status: {renderJob?.status || "idle"}</p><p>Current scene: {renderStats.currentClip?.sceneId || selectedClip?.sceneId || "—"} · speaker: {renderStats.currentClip?.speaker || "—"} · cache hits: {renderStats.cacheHitCount} · failed: {renderJob?.failedClipIds?.length || 0}</p><p>Preview: {(renderStats.currentClip?.sourceText || selectedClip?.sourceText || "").slice(0, 140)}</p><p>Elapsed: {renderStats.startedAt ? Math.round((renderClock - renderStats.startedAt) / 1000) : 0}s · estimated remaining: {renderJob?.progressPercent ? Math.round(((renderClock - renderStats.startedAt) / Math.max(1, renderJob.progressPercent)) * (100 - renderJob.progressPercent) / 1000) : 0}s</p></section><section className="timeline" aria-label="Visual audiobook timeline">{project.tracks.map((track) => <article className={`track track-${track.type}`} key={track.id}><aside><strong>{track.name}</strong><small>{track.type}</small><button onClick={() => commit({ ...project, tracks: project.tracks.map((item) => item.id === track.id ? { ...item, muted: !item.muted } : item) })}>{track.muted ? "Unmute" : "Mute"}</button></aside><div className="lane">{track.clips.map((clip) => <div className="clip" role="button" tabIndex="0" onClick={() => setSelectedClipId(clip.id)} key={clip.id} style={{ left: `${(clip.start / project.duration) * 100}%`, width: `${(clip.duration / project.duration) * 100}%`, background: track.color }}><strong>{clip.title}</strong><span>Character {clip.characterId || "—"} · Vol {clip.volume} · {clip.renderState || "not_rendered"} {clip.cached ? "· cached" : ""}</span><div className="clip-actions"><button onClick={(e) => { e.stopPropagation(); startRender({ clipIds: [clip.id] }); }}>{clip.renderState === "failed" ? "Retry" : "Regenerate"}</button><button onClick={(e) => { e.stopPropagation(); playRenderedFrom(clip.id); }}>Play preview</button><button onClick={(e) => { e.stopPropagation(); deleteClipAudio(clip.id); }}>Delete audio</button></div><div className="automation">{clip.automation.map((point, index) => <i key={index} style={{ left: `${(point.at / clip.duration) * 100}%`, bottom: `${point.volume * 70}%` }} />)}</div></div>)}</div></article>)}</section>
    <section className="studio-grid"><article className="studio-panel"><h2>Clip editor</h2>{project.tracks.map((track) => track.clips.map((clip) => <div className="editor-row" key={clip.id}><span>{track.name}: {clip.title}</span><label>Character ID<input value={clip.characterId || ""} onChange={(e) => editClip(track.id, clip.id, { characterId: e.target.value })} /></label><label>Speaker<input value={clip.speaker || ""} onChange={(e) => editClip(track.id, clip.id, { speaker: e.target.value })} /></label><label>Emotion<input value={clip.emotion || "neutral"} onChange={(e) => editClip(track.id, clip.id, { emotion: e.target.value })} /></label><label>Voice<input value={clip.voiceId || ""} onChange={(e) => editClip(track.id, clip.id, { voiceId: e.target.value })} /></label><label>Rate<input type="number" step="0.05" value={clip.rate || 1} onChange={(e) => editClip(track.id, clip.id, { rate: Number(e.target.value) })} /></label><label>Pitch<input type="number" step="0.05" value={clip.pitch || 1} onChange={(e) => editClip(track.id, clip.id, { pitch: Number(e.target.value) })} /></label><label>Volume<input type="range" min="0" max="1" step="0.01" value={clip.volume} onChange={(e) => editClip(track.id, clip.id, { volume: Number(e.target.value) })} /></label><label>Pause before<input type="number" min="0" value={clip.pauseBefore || 0} onChange={(e) => editClip(track.id, clip.id, { pauseBefore: Number(e.target.value) })} /></label><label>Pause after<input type="number" min="0" value={clip.pauseAfter || 0} onChange={(e) => editClip(track.id, clip.id, { pauseAfter: Number(e.target.value) })} /></label><label>Fade in<input type="number" min="0" value={clip.fadeIn} onChange={(e) => editClip(track.id, clip.id, { fadeIn: Number(e.target.value) })} /></label><label>Fade out<input type="number" min="0" value={clip.fadeOut} onChange={(e) => editClip(track.id, clip.id, { fadeOut: Number(e.target.value) })} /></label></div>))}</article><article className="studio-panel"><h2>Pause editor</h2><p>{activeClip?.title}</p>{activeClip?.pauses.map((pause, index) => <p key={index}>Pause at {pause.at}s for {pause.duration}s</p>)}<button onClick={() => editClip("narrator", "clip_narrator_1", { pauses: [...activeClip.pauses, { at: 14, duration: 0.5 }] })}>Add narrator pause</button></article><article className="studio-panel"><h2>Scene metadata</h2>{(project.scenes || []).map((scene) => <div className="editor-row" key={scene.id}><strong>{scene.id}</strong><label>Location<input value={scene.metadata?.location || ""} onChange={(e) => commit(updateScene(project, scene.id, { metadata: { location: e.target.value } }))} /></label><label>Mood<input value={scene.metadata?.mood || ""} onChange={(e) => commit(updateScene(project, scene.id, { metadata: { mood: e.target.value } }))} /></label><button onClick={() => generateProductionTimeline({ preserveManualEdits: true })}>Regenerate one scene</button></div>)}</article><article className="studio-panel"><h2>Live preview mix</h2>{preview.length ? preview.map((item) => <p key={`${item.track}-${item.clip}`}>{item.track} — {item.clip} at volume {item.effectiveVolume}</p>) : <p>No active clips at cursor.</p>}</article></section>
  </main>;
}

export default AiAudioStudio;
