import { useEffect, useMemo, useRef, useState } from "react";
import { AudioRenderQueue, applyClipRenderState, buildChapterPlaybackManifest, loadRenderJob, revokeClipObjectUrl } from "../lib/audioRenderingPipeline";
import { createAudioStudioProject, createAudioStudioProjectFromChapter, deserializeAudioStudioProject, fetchAudioStudioChapters, fetchAudioStudioChapterText, fetchAudioStudioNovels, getProjectStorageKey, hasChapterText, loadAudioStudioProject, mergeManualEdits, mixPreviewSummary, productionProgressStates, saveAudioStudioProject, serializeAudioStudioProject, updateClip, updateScene } from "../lib/aiAudioStudio";
import { supabase } from "../lib/supabase";
import { BrowserMixerRenderer, buildMixerProject, buildPreviewManifest, getMixerStorageKey, loadMixerProject, MixerExportJob, rebuildChangedTracks, saveMixerProject } from "../lib/audioMixer";
import { applyProductionPlan, calculateProductionScore, createProductionPlan, generateProductionDiff, generateProductionReport, PRODUCTION_MODES, revertProductionPlan, saveProductionPlan } from "../lib/aiProductionEngine";
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
  const [mixerOpen, setMixerOpen] = useState(false);
  const [mixerProject, setMixerProject] = useState(null);
  const [mixerZoom, setMixerZoom] = useState(12);
  const [previewState, setPreviewState] = useState({ status: "stopped", currentTime: 0, error: "" });
  const [exportState, setExportState] = useState({ status: "idle", progress: 0, error: "" });
  const [productionMode, setProductionMode] = useState(PRODUCTION_MODES.ASSISTED);
  const [productionPlan, setProductionPlan] = useState(null);
  const [productionDiff, setProductionDiff] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const mixerRuntimeRef = useRef({ context: null, timer: null, startedAt: 0, exportJob: null, downloadUrl: "" });
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
  useEffect(() => () => { renderQueueRef.current?.cancel(); playbackRef.current.audio?.pause(); playbackRef.current.urls.forEach((url) => URL.revokeObjectURL(url)); const runtime = mixerRuntimeRef.current; runtime.exportJob?.cancel(); clearInterval(runtime.timer); runtime.context?.close(); if (runtime.downloadUrl) URL.revokeObjectURL(runtime.downloadUrl); }, []);

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

  function buildMix() { const meta = { projectId: project.id || project.projectId || `${project.novelId}:${project.chapterId}`, novelId: project.novelId, chapterId: project.chapterId }; const next = buildMixerProject(project, mixerProject || loadMixerProject(meta)); setMixerProject(saveMixerProject(next)); setMixerOpen(true); setStatus("Editable chapter mix built."); }
  function patchMixerTrack(trackId, patch) { setMixerProject((current) => saveMixerProject({ ...current, updatedAt: new Date().toISOString(), tracks: current.tracks.map((track) => track.trackId === trackId ? { ...track, ...patch } : track) })); }
  function stopMixPreview(message = "Preview stopped") { const runtime = mixerRuntimeRef.current; clearInterval(runtime.timer); runtime.timer = null; runtime.context?.close(); runtime.context = null; setPreviewState((state) => ({ ...state, status: "stopped" })); setStatus(message); }
  async function previewMix() { if (!mixerProject) { buildMix(); return; } const manifest = buildPreviewManifest(mixerProject, previewState.currentTime); if (manifest.missingAssets.length) { setPreviewState((state) => ({ ...state, status: "stopped", error: `${manifest.missingAssets.length} asset(s) missing` })); setStatus("Preview stopped safely: missing assets."); return; } try { const Context = window.AudioContext || window.webkitAudioContext; if (!Context) throw new Error("Browser AudioContext is unavailable."); const context = new Context({ sampleRate: mixerProject.sampleRate }); mixerRuntimeRef.current.context = context; mixerRuntimeRef.current.startedAt = context.currentTime - previewState.currentTime; mixerRuntimeRef.current.timer = setInterval(() => { const currentTime = Math.min(mixerProject.duration, context.currentTime - mixerRuntimeRef.current.startedAt); setPreviewState({ status: "playing", currentTime, error: "" }); if (currentTime >= mixerProject.duration) stopMixPreview("Preview completed"); }, 100); setPreviewState((state) => ({ ...state, status: "playing", error: "" })); } catch (error) { setPreviewState((state) => ({ ...state, status: "stopped", error: error.message })); } }
  function pauseMixPreview() { const context = mixerRuntimeRef.current.context; if (!context) return; context.suspend(); clearInterval(mixerRuntimeRef.current.timer); setPreviewState((state) => ({ ...state, status: "paused" })); }
  async function exportChapterAudio() { if (!mixerProject || exportState.status === "exporting") return; const missing = buildPreviewManifest(mixerProject).missingAssets; if (missing.length) { setExportState({ status: "failed", progress: 0, error: `Cannot export: ${missing.length} asset(s) missing.` }); return; } const job = new MixerExportJob({ onProgress: (progress) => setExportState({ status: "exporting", progress, error: "" }) }); let renderer; mixerRuntimeRef.current.exportJob = job; setExportState({ status: "exporting", progress: 0, error: "" }); try { renderer = new BrowserMixerRenderer(); const blob = await job.export(mixerProject, (chunk) => renderer.renderChunk(chunk)); const url = URL.createObjectURL(blob); if (mixerRuntimeRef.current.downloadUrl) URL.revokeObjectURL(mixerRuntimeRef.current.downloadUrl); mixerRuntimeRef.current.downloadUrl = url; const link = document.createElement("a"); link.href = url; link.download = `chapter-${mixerProject.chapterId || "mix"}.wav`; link.click(); setExportState({ status: "completed", progress: 100, error: "" }); } catch (error) { setExportState({ status: error.name === "AbortError" ? "cancelled" : "failed", progress: 0, error: error.message }); } finally { await renderer?.dispose(); } }

  function exportJson() {
    const blob = new Blob([serializeAudioStudioProject(project)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/\W+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function analyzeProduction() { const plan = createProductionPlan(project, { mode: productionMode, mixerProject, previousPlan: productionPlan }); setProductionPlan(saveProductionPlan(plan)); setProductionDiff(null); setStatus("Production analysis completed."); }
  function applyProduction() { if (!productionPlan) return; const next = applyProductionPlan(project, productionPlan); setProductionDiff(generateProductionDiff(project, next)); commit(next); setProductionPlan(saveProductionPlan({ ...productionPlan, status: "applied" })); }
  function revertProduction(options) { const next = revertProductionPlan(project, options); commit(next); setStatus(options?.sceneId ? `Reverted ${options.sceneId}.` : "Production plan fully reverted."); }
  function exportProductionReport() { if (!productionPlan) return; const blob = new Blob([JSON.stringify(generateProductionReport(productionPlan, project, mixerProject), null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `production-report-${project.chapterId || "chapter"}.json`; link.click(); URL.revokeObjectURL(url); }
  function toggleSceneLock(sceneId) { if (!productionPlan) return; setProductionPlan(saveProductionPlan({ ...productionPlan, scenes: productionPlan.scenes.map((scene) => scene.sceneId === sceneId ? { ...scene, manuallyLocked: !scene.manuallyLocked } : scene) })); }

  async function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    commit(deserializeAudioStudioProject(await file.text()));
    setStatus(`Imported ${file.name}`);
    event.target.value = "";
  }

  return <main className="audio-studio"><header className="studio-hero"><div><p className="eyebrow">AI Audio Studio v1</p><h1>Complete audiobook production interface</h1><p>Layer narration, cast voices, ambience, music and sound effects with non-destructive automation.</p></div><div className="studio-actions"><button onClick={undo} disabled={!history.length}>Undo</button><button onClick={redo} disabled={!future.length}>Redo</button><button onClick={exportJson}>Export project JSON</button><button onClick={() => fileRef.current?.click()}>Import project JSON</button><input ref={fileRef} hidden type="file" accept="application/json" onChange={importJson} /></div></header>
    <section className="studio-panel"><h2>Production source</h2>{loadingError && <p className="admin-toast">{loadingError}</p>}<div className="editor-row"><label>Novel<select value={selectedNovelId} onChange={(e) => { setSelectedNovelId(e.target.value); setSelectedChapterId(""); }}><option value="">Select novel</option>{novels.map((novel) => <option key={novel.id} value={novel.id}>{novel.title}</option>)}</select></label><label>Chapter<select value={selectedChapterId} onChange={(e) => setSelectedChapterId(e.target.value)} disabled={!selectedNovelId}><option value="">Select chapter</option>{chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>Chapter {chapter.number}: {chapter.title || "Untitled"} — {hasChapterText(chapter) ? "text available" : "no text"}</option>)}</select></label><button onClick={() => generateProductionTimeline()}>Generate Production Timeline</button><button onClick={() => generateProductionTimeline({ forceOverwrite: true, preserveManualEdits: false })}>Regenerate whole project</button></div><p>Progress: {progressState}</p><p>States: {productionProgressStates.join(" → ")}</p><p>Project key: {selectedNovelId && selectedChapterId ? getProjectStorageKey(selectedNovelId, selectedChapterId) : "Select a chapter"}</p>{!novels.length && <p className="empty-state">No novels found.</p>}{selectedNovelId && !chapters.length && <p className="empty-state">No chapters found for this novel.</p>}</section>
    <section className="studio-panel production-engine"><div className="production-heading"><div><p className="eyebrow">AI Production Engine v2</p><h2>Cinematic production plan</h2></div><label>Production mode<select value={productionMode} onChange={(event) => setProductionMode(event.target.value)}><option value={PRODUCTION_MODES.MANUAL}>Manual</option><option value={PRODUCTION_MODES.ASSISTED}>Assisted</option><option value={PRODUCTION_MODES.FULL_AUTO}>Full Auto</option></select></label></div><div className="studio-actions"><button onClick={analyzeProduction}>Analyze Chapter</button><button disabled={!productionPlan} onClick={applyProduction}>Apply Production Plan</button><button disabled={!productionPlan} onClick={() => setStatus("Production preview uses non-destructive overrides.")}>Preview Production</button><button disabled={!project.production} onClick={() => revertProduction()}>Revert Production Plan</button><button disabled={!productionPlan} onClick={analyzeProduction}>Regenerate Production Plan</button><button disabled={!productionPlan} onClick={() => setStatus("Manual edits and item locks are preserved on application.")}>Lock Manual Edits</button><button disabled={!productionPlan} onClick={exportProductionReport}>Export Production Report</button></div>{productionPlan && <><div className="production-summary"><strong>Status: {productionPlan.status}</strong><strong>Overall score: {calculateProductionScore(productionPlan, project, mixerProject).overallScore}</strong><span>Confidence: {Math.round(productionPlan.confidence * 100)}%</span><span>{productionPlan.warnings.length} warnings</span></div><div className="production-scenes">{productionPlan.scenes.map((scene) => <article key={scene.sceneId}><div><strong>{scene.sceneId}</strong><span className={`confidence confidence-${scene.confidence >= .78 ? "high" : scene.confidence >= .52 ? "medium" : "low"}`}>{Math.round(scene.confidence * 100)}%</span>{scene.manuallyLocked && <span className="lock-badge">🔒 Locked</span>}</div><h3>{scene.sceneType}</h3><p>{scene.emotionalArc} · {scene.pacing.label} · intensity {scene.intensity}</p><p>{scene.confidenceReason}</p><div><button onClick={() => toggleSceneLock(scene.sceneId)}>{scene.manuallyLocked ? "Unlock" : "Lock"}</button><button disabled={!project.production} onClick={() => revertProduction({ sceneId: scene.sceneId })}>Revert scene</button></div></article>)}</div><div className="production-lower"><article><h3>Production diff</h3>{productionDiff ? <><p>{productionDiff.changedScenes.length} scenes · {productionDiff.count} clips changed</p>{productionDiff.changedClips.slice(0, 8).map((change) => <p key={change.clipId}><strong>{change.clipId}</strong>: {JSON.stringify(change.before)} → {JSON.stringify(change.after)} ({Math.round(change.confidence * 100)}% — {change.reason})</p>)}</> : <p>Apply a plan to compare before and after values.</p>}</article><article><button onClick={() => setReportOpen((open) => !open)}>Production report panel</button>{reportOpen && <pre>{JSON.stringify(generateProductionReport(productionPlan, project, mixerProject), null, 2)}</pre>}</article></div></>}</section>
    <section className="transport"><button onClick={() => setProject({ ...project, cursor: Math.max(0, project.cursor - 5) })}>⏪</button><button onClick={() => setStatus("Live preview playing")}>▶ Live preview</button><button onClick={() => playRenderedFrom(selectedClip?.id)}>▶ Rendered playback</button><button onClick={() => setProject({ ...project, cursor: Math.min(project.duration, project.cursor + 5) })}>⏩</button><label>Cursor <input type="range" min="0" max={project.duration} value={project.cursor} onChange={(e) => setProject({ ...project, cursor: Number(e.target.value) })} /></label><strong>{project.cursor}s</strong><span>{status}</span></section>
    <section className="studio-panel render-panel"><h2>Audio Rendering Pipeline v1</h2><div className="studio-actions"><button onClick={() => startRender()}>Start Render</button><button onClick={pauseRender}>Pause Render</button><button onClick={resumeRender}>Resume Render</button><button onClick={cancelRender}>Cancel Render</button><button onClick={() => startRender({ retryFailedOnly: true })}>Retry Failed Clips</button><button onClick={() => startRender({ clipIds: project.tracks.flatMap((t) => t.clips).filter((c) => c.sceneId === selectedClip?.sceneId).map((c) => c.id) })}>Render Selected Scene</button><button onClick={() => selectedClip && startRender({ clipIds: [selectedClip.id] })}>Render Selected Clip</button></div><p>Overall: {renderJob?.progressPercent || 0}% · {renderJob?.completedClipIds?.length || 0}/{renderJob?.totalClips || manifest.items.filter((i) => i.type === "speech").length} clips · Status: {renderJob?.status || "idle"}</p><p>Current scene: {renderStats.currentClip?.sceneId || selectedClip?.sceneId || "—"} · speaker: {renderStats.currentClip?.speaker || "—"} · cache hits: {renderStats.cacheHitCount} · failed: {renderJob?.failedClipIds?.length || 0}</p><p>Preview: {(renderStats.currentClip?.sourceText || selectedClip?.sourceText || "").slice(0, 140)}</p><p>Elapsed: {renderStats.startedAt ? Math.round((renderClock - renderStats.startedAt) / 1000) : 0}s · estimated remaining: {renderJob?.progressPercent ? Math.round(((renderClock - renderStats.startedAt) / Math.max(1, renderJob.progressPercent)) * (100 - renderJob.progressPercent) / 1000) : 0}s</p></section><section className="timeline" aria-label="Visual audiobook timeline">{project.tracks.map((track) => <article className={`track track-${track.type}`} key={track.id}><aside><strong>{track.name}</strong><small>{track.type}</small><button onClick={() => commit({ ...project, tracks: project.tracks.map((item) => item.id === track.id ? { ...item, muted: !item.muted } : item) })}>{track.muted ? "Unmute" : "Mute"}</button></aside><div className="lane">{track.clips.map((clip) => <div className="clip" role="button" tabIndex="0" onClick={() => setSelectedClipId(clip.id)} key={clip.id} style={{ left: `${(clip.start / project.duration) * 100}%`, width: `${(clip.duration / project.duration) * 100}%`, background: track.color }}><strong>{clip.title}</strong><span>Character {clip.characterId || "—"} · Vol {clip.volume} · {clip.renderState || "not_rendered"} {clip.cached ? "· cached" : ""}</span><div className="clip-actions"><button onClick={(e) => { e.stopPropagation(); startRender({ clipIds: [clip.id] }); }}>{clip.renderState === "failed" ? "Retry" : "Regenerate"}</button><button onClick={(e) => { e.stopPropagation(); playRenderedFrom(clip.id); }}>Play preview</button><button onClick={(e) => { e.stopPropagation(); deleteClipAudio(clip.id); }}>Delete audio</button></div><div className="automation">{clip.automation.map((point, index) => <i key={index} style={{ left: `${(point.at / clip.duration) * 100}%`, bottom: `${point.volume * 70}%` }} />)}</div></div>)}</div></article>)}</section>
    <section className="studio-panel mixer-panel"><div className="mixer-heading"><div><p className="eyebrow">Audio Mixer v1</p><h2>Multitrack chapter mix</h2></div><div className="studio-actions"><button onClick={() => setMixerOpen((open) => !open)}>Open Mixer</button><button onClick={buildMix}>Build Mix</button><button onClick={previewMix}>Preview Mix</button><button onClick={pauseMixPreview}>Pause Preview</button><button onClick={() => stopMixPreview()}>Stop Preview</button><button onClick={exportChapterAudio} disabled={exportState.status === "exporting"}>Export Chapter Audio</button><button onClick={() => mixerRuntimeRef.current.exportJob?.cancel()} disabled={exportState.status !== "exporting"}>Cancel Export</button><button onClick={() => mixerProject && setMixerProject(saveMixerProject(rebuildChangedTracks(project, mixerProject, project.tracks.flatMap((t) => t.clips).filter((c) => c.renderState === "rendered").map((c) => c.id))))}>Rebuild Changed Tracks</button></div></div>
      <div className="mixer-status"><span>Preview: {previewState.status} · {previewState.currentTime.toFixed(1)} / {(mixerProject?.duration || 0).toFixed(1)}s</span><span>Export: {exportState.status} · {exportState.progress}%</span>{(previewState.error || exportState.error) && <strong className="missing-warning">⚠ {previewState.error || exportState.error}</strong>}<label>Zoom <input type="range" min="4" max="40" value={mixerZoom} onChange={(event) => setMixerZoom(Number(event.target.value))} /></label></div>
      {mixerOpen && mixerProject && <div className="mixer-scroll"><div className="mixer-ruler" style={{ width: `${mixerProject.duration * mixerZoom}px` }}>{Array.from({ length: Math.ceil(mixerProject.duration / 10) + 1 }, (_, index) => <span key={index} style={{ left: `${index * 10 * mixerZoom}px` }}>{index * 10}s</span>)}<i style={{ left: `${previewState.currentTime * mixerZoom}px` }} /></div>{mixerProject.tracks.map((track) => <article className="mixer-track" key={track.trackId}><aside><strong>{track.title}</strong><div><button onClick={() => patchMixerTrack(track.trackId, { muted: !track.muted })}>{track.muted ? "Unmute" : "Mute"}</button><button onClick={() => patchMixerTrack(track.trackId, { solo: !track.solo })}>{track.solo ? "Unsolo" : "Solo"}</button></div><label>Vol <input type="range" min="0" max="1.5" step=".01" value={track.volume} onChange={(e) => patchMixerTrack(track.trackId, { volume: Number(e.target.value) })} /></label><label>Pan <input type="range" min="-1" max="1" step=".01" value={track.pan} onChange={(e) => patchMixerTrack(track.trackId, { pan: Number(e.target.value) })} /></label></aside><div className="mixer-lane" style={{ width: `${mixerProject.duration * mixerZoom}px` }}>{track.clips.map((clip) => <div className={`mixer-clip ${clip.missingAudio ? "is-missing" : ""}`} key={clip.clipId} style={{ left: `${clip.startTime * mixerZoom}px`, width: `${Math.max(12, clip.duration * mixerZoom)}px` }} title={clip.missingAudio ? "Missing audio asset" : clip.sourceClipId}><b>{clip.sourceClipId || "Pause"}</b>{clip.missingAudio && <span>Missing asset</span>}</div>)}</div></article>)}</div>}
      {!mixerProject && <p className="empty-state">Build a mix from the current rendered production timeline. Mixer projects are saved separately at {getMixerStorageKey(project.id || project.projectId, project.novelId, project.chapterId)}.</p>}
    </section>
    <section className="studio-grid"><article className="studio-panel"><h2>Clip editor</h2>{project.tracks.map((track) => track.clips.map((clip) => <div className="editor-row" key={clip.id}><span>{track.name}: {clip.title}</span><label>Character ID<input value={clip.characterId || ""} onChange={(e) => editClip(track.id, clip.id, { characterId: e.target.value })} /></label><label>Speaker<input value={clip.speaker || ""} onChange={(e) => editClip(track.id, clip.id, { speaker: e.target.value })} /></label><label>Emotion<input value={clip.emotion || "neutral"} onChange={(e) => editClip(track.id, clip.id, { emotion: e.target.value })} /></label><label>Voice<input value={clip.voiceId || ""} onChange={(e) => editClip(track.id, clip.id, { voiceId: e.target.value })} /></label><label>Rate<input type="number" step="0.05" value={clip.rate || 1} onChange={(e) => editClip(track.id, clip.id, { rate: Number(e.target.value) })} /></label><label>Pitch<input type="number" step="0.05" value={clip.pitch || 1} onChange={(e) => editClip(track.id, clip.id, { pitch: Number(e.target.value) })} /></label><label>Volume<input type="range" min="0" max="1" step="0.01" value={clip.volume} onChange={(e) => editClip(track.id, clip.id, { volume: Number(e.target.value) })} /></label><label>Pause before<input type="number" min="0" value={clip.pauseBefore || 0} onChange={(e) => editClip(track.id, clip.id, { pauseBefore: Number(e.target.value) })} /></label><label>Pause after<input type="number" min="0" value={clip.pauseAfter || 0} onChange={(e) => editClip(track.id, clip.id, { pauseAfter: Number(e.target.value) })} /></label><label>Fade in<input type="number" min="0" value={clip.fadeIn} onChange={(e) => editClip(track.id, clip.id, { fadeIn: Number(e.target.value) })} /></label><label>Fade out<input type="number" min="0" value={clip.fadeOut} onChange={(e) => editClip(track.id, clip.id, { fadeOut: Number(e.target.value) })} /></label></div>))}</article><article className="studio-panel"><h2>Pause editor</h2><p>{activeClip?.title}</p>{activeClip?.pauses.map((pause, index) => <p key={index}>Pause at {pause.at}s for {pause.duration}s</p>)}<button onClick={() => editClip("narrator", "clip_narrator_1", { pauses: [...activeClip.pauses, { at: 14, duration: 0.5 }] })}>Add narrator pause</button></article><article className="studio-panel"><h2>Scene metadata</h2>{(project.scenes || []).map((scene) => <div className="editor-row" key={scene.id}><strong>{scene.id}</strong><label>Location<input value={scene.metadata?.location || ""} onChange={(e) => commit(updateScene(project, scene.id, { metadata: { location: e.target.value } }))} /></label><label>Mood<input value={scene.metadata?.mood || ""} onChange={(e) => commit(updateScene(project, scene.id, { metadata: { mood: e.target.value } }))} /></label><button onClick={() => generateProductionTimeline({ preserveManualEdits: true })}>Regenerate one scene</button></div>)}</article><article className="studio-panel"><h2>Live preview mix</h2>{preview.length ? preview.map((item) => <p key={`${item.track}-${item.clip}`}>{item.track} — {item.clip} at volume {item.effectiveVolume}</p>) : <p>No active clips at cursor.</p>}</article></section>
  </main>;
}

export default AiAudioStudio;
