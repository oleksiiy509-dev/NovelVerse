import { useEffect, useMemo, useRef, useState } from "react";
import { createAudioStudioProject, deserializeAudioStudioProject, mixPreviewSummary, serializeAudioStudioProject, updateClip } from "../lib/aiAudioStudio";
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
  const fileRef = useRef(null);
  const activeClip = project.tracks[0]?.clips[0];
  const preview = useMemo(() => mixPreviewSummary(project, project.cursor), [project]);

  useEffect(() => {
    const id = setTimeout(() => {
      localStorage.setItem(storageKey, serializeAudioStudioProject(project));
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
    <section className="transport"><button onClick={() => setProject({ ...project, cursor: Math.max(0, project.cursor - 5) })}>⏪</button><button onClick={() => setStatus("Live preview playing")}>▶ Live preview</button><button onClick={() => setProject({ ...project, cursor: Math.min(project.duration, project.cursor + 5) })}>⏩</button><label>Cursor <input type="range" min="0" max={project.duration} value={project.cursor} onChange={(e) => setProject({ ...project, cursor: Number(e.target.value) })} /></label><strong>{project.cursor}s</strong><span>{status}</span></section>
    <section className="timeline" aria-label="Visual audiobook timeline">{project.tracks.map((track) => <article className={`track track-${track.type}`} key={track.id}><aside><strong>{track.name}</strong><small>{track.type}</small><button onClick={() => commit({ ...project, tracks: project.tracks.map((item) => item.id === track.id ? { ...item, muted: !item.muted } : item) })}>{track.muted ? "Unmute" : "Mute"}</button></aside><div className="lane">{track.clips.map((clip) => <div className="clip" key={clip.id} style={{ left: `${(clip.start / project.duration) * 100}%`, width: `${(clip.duration / project.duration) * 100}%`, background: track.color }}><strong>{clip.title}</strong><span>Character {clip.characterId || "—"} · Vol {clip.volume} · ↗ {clip.fadeIn}s · ↘ {clip.fadeOut}s</span><div className="automation">{clip.automation.map((point, index) => <i key={index} style={{ left: `${(point.at / clip.duration) * 100}%`, bottom: `${point.volume * 70}%` }} />)}</div></div>)}</div></article>)}</section>
    <section className="studio-grid"><article className="studio-panel"><h2>Volume automation + fades</h2>{project.tracks.map((track) => track.clips.map((clip) => <div className="editor-row" key={clip.id}><span>{track.name}: {clip.title}</span><label>Character ID<input value={clip.characterId || ""} onChange={(e) => editClip(track.id, clip.id, { characterId: e.target.value })} /></label><label>Volume<input type="range" min="0" max="1" step="0.01" value={clip.volume} onChange={(e) => editClip(track.id, clip.id, { volume: Number(e.target.value) })} /></label><label>Fade in<input type="number" min="0" value={clip.fadeIn} onChange={(e) => editClip(track.id, clip.id, { fadeIn: Number(e.target.value) })} /></label><label>Fade out<input type="number" min="0" value={clip.fadeOut} onChange={(e) => editClip(track.id, clip.id, { fadeOut: Number(e.target.value) })} /></label></div>))}</article><article className="studio-panel"><h2>Pause editor</h2><p>{activeClip?.title}</p>{activeClip?.pauses.map((pause, index) => <p key={index}>Pause at {pause.at}s for {pause.duration}s</p>)}<button onClick={() => editClip("narrator", "clip_narrator_1", { pauses: [...activeClip.pauses, { at: 14, duration: 0.5 }] })}>Add narrator pause</button></article><article className="studio-panel"><h2>Live preview mix</h2>{preview.length ? preview.map((item) => <p key={`${item.track}-${item.clip}`}>{item.track} — {item.clip} at volume {item.effectiveVolume}</p>) : <p>No active clips at cursor.</p>}</article></section>
  </main>;
}

export default AiAudioStudio;
