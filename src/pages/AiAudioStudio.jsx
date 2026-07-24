import { useEffect, useMemo, useRef, useState } from "react";
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
  const activeClip = project.tracks[0]?.clips[0];
  const preview = useMemo(() => mixPreviewSummary(project, project.cursor), [project]);

  useEffect(() => { fetchAudioStudioNovels(supabase).then(setNovels).catch((error) => setLoadingError(error.message || "Supabase request failed.")); }, []);

  useEffect(() => { if (!selectedNovelId) { setChapters([]); return; } fetchAudioStudioChapters(supabase, selectedNovelId).then(setChapters).catch((error) => setLoadingError(error.message || "Supabase request failed.")); }, [selectedNovelId]);

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
    <section className="transport"><button onClick={() => setProject({ ...project, cursor: Math.max(0, project.cursor - 5) })}>⏪</button><button onClick={() => setStatus("Live preview playing")}>▶ Live preview</button><button onClick={() => setProject({ ...project, cursor: Math.min(project.duration, project.cursor + 5) })}>⏩</button><label>Cursor <input type="range" min="0" max={project.duration} value={project.cursor} onChange={(e) => setProject({ ...project, cursor: Number(e.target.value) })} /></label><strong>{project.cursor}s</strong><span>{status}</span></section>
    <section className="timeline" aria-label="Visual audiobook timeline">{project.tracks.map((track) => <article className={`track track-${track.type}`} key={track.id}><aside><strong>{track.name}</strong><small>{track.type}</small><button onClick={() => commit({ ...project, tracks: project.tracks.map((item) => item.id === track.id ? { ...item, muted: !item.muted } : item) })}>{track.muted ? "Unmute" : "Mute"}</button></aside><div className="lane">{track.clips.map((clip) => <div className="clip" key={clip.id} style={{ left: `${(clip.start / project.duration) * 100}%`, width: `${(clip.duration / project.duration) * 100}%`, background: track.color }}><strong>{clip.title}</strong><span>Character {clip.characterId || "—"} · Vol {clip.volume} · ↗ {clip.fadeIn}s · ↘ {clip.fadeOut}s</span><div className="automation">{clip.automation.map((point, index) => <i key={index} style={{ left: `${(point.at / clip.duration) * 100}%`, bottom: `${point.volume * 70}%` }} />)}</div></div>)}</div></article>)}</section>
    <section className="studio-grid"><article className="studio-panel"><h2>Clip editor</h2>{project.tracks.map((track) => track.clips.map((clip) => <div className="editor-row" key={clip.id}><span>{track.name}: {clip.title}</span><label>Character ID<input value={clip.characterId || ""} onChange={(e) => editClip(track.id, clip.id, { characterId: e.target.value })} /></label><label>Speaker<input value={clip.speaker || ""} onChange={(e) => editClip(track.id, clip.id, { speaker: e.target.value })} /></label><label>Emotion<input value={clip.emotion || "neutral"} onChange={(e) => editClip(track.id, clip.id, { emotion: e.target.value })} /></label><label>Voice<input value={clip.voiceId || ""} onChange={(e) => editClip(track.id, clip.id, { voiceId: e.target.value })} /></label><label>Rate<input type="number" step="0.05" value={clip.rate || 1} onChange={(e) => editClip(track.id, clip.id, { rate: Number(e.target.value) })} /></label><label>Pitch<input type="number" step="0.05" value={clip.pitch || 1} onChange={(e) => editClip(track.id, clip.id, { pitch: Number(e.target.value) })} /></label><label>Volume<input type="range" min="0" max="1" step="0.01" value={clip.volume} onChange={(e) => editClip(track.id, clip.id, { volume: Number(e.target.value) })} /></label><label>Pause before<input type="number" min="0" value={clip.pauseBefore || 0} onChange={(e) => editClip(track.id, clip.id, { pauseBefore: Number(e.target.value) })} /></label><label>Pause after<input type="number" min="0" value={clip.pauseAfter || 0} onChange={(e) => editClip(track.id, clip.id, { pauseAfter: Number(e.target.value) })} /></label><label>Fade in<input type="number" min="0" value={clip.fadeIn} onChange={(e) => editClip(track.id, clip.id, { fadeIn: Number(e.target.value) })} /></label><label>Fade out<input type="number" min="0" value={clip.fadeOut} onChange={(e) => editClip(track.id, clip.id, { fadeOut: Number(e.target.value) })} /></label></div>))}</article><article className="studio-panel"><h2>Pause editor</h2><p>{activeClip?.title}</p>{activeClip?.pauses.map((pause, index) => <p key={index}>Pause at {pause.at}s for {pause.duration}s</p>)}<button onClick={() => editClip("narrator", "clip_narrator_1", { pauses: [...activeClip.pauses, { at: 14, duration: 0.5 }] })}>Add narrator pause</button></article><article className="studio-panel"><h2>Scene metadata</h2>{(project.scenes || []).map((scene) => <div className="editor-row" key={scene.id}><strong>{scene.id}</strong><label>Location<input value={scene.metadata?.location || ""} onChange={(e) => commit(updateScene(project, scene.id, { metadata: { location: e.target.value } }))} /></label><label>Mood<input value={scene.metadata?.mood || ""} onChange={(e) => commit(updateScene(project, scene.id, { metadata: { mood: e.target.value } }))} /></label><button onClick={() => generateProductionTimeline({ preserveManualEdits: true })}>Regenerate one scene</button></div>))}</article><article className="studio-panel"><h2>Live preview mix</h2>{preview.length ? preview.map((item) => <p key={`${item.track}-${item.clip}`}>{item.track} — {item.clip} at volume {item.effectiveVolume}</p>) : <p>No active clips at cursor.</p>}</article></section>
  </main>;
}

export default AiAudioStudio;
