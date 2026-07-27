import { useCallback, useEffect, useMemo, useState } from "react";
import { BackgroundQueue, BetaRepository, BETA_STAGES, buildExport, collectDiagnostics, exportBetaSettings, importBetaSettings, performanceSnapshot, resetBetaSettings } from "../lib/betaIntegration";
import { diagnosticLogger } from "../lib/diagnosticLogger";
import "../styles/BetaDashboard.css";

const fmt = (ms) => ms == null ? "—" : `${Math.ceil(ms / 1000)}s`;
function BetaDashboard() {
  const repository = useMemo(() => new BetaRepository(), []);
  const [state, setState] = useState(() => repository.snapshot());
  const [diagnostics, setDiagnostics] = useState(null);
  const [tab, setTab] = useState("pipeline");
  const [settingsQuery, setSettingsQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const refresh = useCallback(() => setState(repository.snapshot()), [repository]);
  const queue = useMemo(() => new BackgroundQueue({ repository, onUpdate: refresh }), [repository, refresh]);
  useEffect(() => { if (repository.state.settings.pipeline.autoResume) queue.resumeAll(); }, [queue, repository]);
  const active = [...state.queue].reverse().find(({ status }) => ["running", "queued", "failed"].includes(status)) || state.queue.at(-1);
  const metrics = useMemo(() => performanceSnapshot(state.queue), [state.queue]);
  const start = async (selectedProject = state.projects[0]) => {
    if (busyAction) return;
    setBusyAction("pipeline");
    setNotice("");
    try {
      const project = selectedProject || repository.upsertProject({ name: "Untitled Beta Project", chapters: ["Chapter 1"] });
      const job = queue.add({ projectId: project.id, chapterIds: project.chapters });
      diagnosticLogger.info("pipeline", "Pipeline started", { projectId: project.id, jobId: job.id });
      refresh();
      await queue.run(job.id, { project });
    } catch (error) {
      setNotice(error.message || "Pipeline failed to start.");
    } finally {
      setBusyAction("");
      refresh();
    }
  };
  const exportFile = (type) => { const project = state.projects[0] || { id: "draft", name: "Draft" }; const blob = buildExport(type, project, type === "diagnostics-report" ? diagnostics || {} : { queue: state.queue }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `novelverse-${type}.${type === "wav" ? "wav" : "json"}`; link.click(); URL.revokeObjectURL(url); };
  const download = (blob, name) => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); };
  const saveSettings = (settings, message) => { repository.state.settings = settings; repository.save(); refresh(); setNotice(message); };
  const settingGroups = Object.entries(state.settings).filter(([name]) => name.toLowerCase().includes(settingsQuery.toLowerCase()));
  return <main className="beta-shell" aria-labelledby="beta-title" aria-busy={!!busyAction}>
    <p className="sr-only" role="status" aria-live="polite">{notice}</p>
    <header className="beta-hero"><div><span className="eyebrow">RELEASE CANDIDATE 1.0</span><h1 id="beta-title">Production Control</h1><p>One workspace from manuscript analysis to finished audiobook.</p></div><button className="primary" disabled={!!busyAction} onClick={() => start()}>{busyAction === "pipeline" ? "Starting…" : "▶ Run complete pipeline"}</button></header>
    {!state.firstLaunchComplete && <section className="wizard"><b>Welcome to NovelVerse Beta</b><span>Connect the local worker, choose defaults, then launch your first production.</span><button onClick={() => { repository.state.firstLaunchComplete = true; repository.save(); refresh(); }}>Finish setup</button></section>}
    <nav className="beta-tabs" aria-label="Production sections" role="tablist">{["pipeline", "projects", "diagnostics", "exports", "settings", "errors"].map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</nav>
    {tab === "pipeline" && <><section className="metric-grid"><article><small>QUEUE</small><strong>{metrics.queueSize}</strong><span>active jobs</span></article><article><small>PROGRESS</small><strong>{active?.progress || 0}%</strong><span>{active?.status || "ready"}</span></article><article><small>ELAPSED</small><strong>{fmt(active?.elapsedMs)}</strong><span>remaining {fmt(active?.remainingMs)}</span></article><article><small>CACHE</small><strong>{metrics.cacheHits}/{metrics.cacheMisses}</strong><span>hits / misses</span></article></section>
      <section className="stage-grid">{BETA_STAGES.map((stage, index) => { const complete = (active?.stageIndex || 0) > index || active?.status === "completed"; const running = active?.currentStage === stage.id; return <article className={`stage ${complete ? "complete" : ""} ${running ? "running" : ""}`} key={stage.id}><span>{complete ? "✓" : String(index + 1).padStart(2, "0")}</span><div><b>{stage.label}</b><small>{running ? "Running" : complete ? "Completed" : "Waiting"}</small></div>{running && <progress value={active.progress} max="100" />}</article>; })}</section>
      <div className="actions"><button onClick={() => active && queue.pause(active.id)}>Stop</button><button onClick={() => active && queue.run(active.id)}>Resume</button><button onClick={() => active && queue.stop(active.id)}>Cancel</button></div></>}
    {tab === "projects" && <section className="panel"><h2>Project Manager</h2>{state.projects.map((project) => <div className="row" key={project.id}><b>{project.name}</b><span>{project.updatedAt}</span><button disabled={!!busyAction} onClick={() => { setTab("pipeline"); setNotice(`Opened ${project.name}.`); start(project); }}>Open</button><button onClick={() => { repository.duplicate(project.id); refresh(); }}>Duplicate</button><button onClick={() => { repository.archive(project.id); refresh(); }}>Archive</button><button onClick={() => { repository.delete(project.id); refresh(); }}>Delete</button></div>)}<h3>Archive</h3>{state.archivedProjects.map((project) => <div className="row" key={project.id}><b>{project.name}</b><button onClick={() => { repository.restore(project.id); refresh(); }}>Restore</button></div>)}</section>}
    {tab === "diagnostics" && <section className="panel"><h2>System Diagnostics</h2><p>Checks the local worker, Piper, storage, AudioContext, connectivity, and browser APIs.</p><div className="actions"><button className="primary" onClick={async () => { const result = await collectDiagnostics(); setDiagnostics(result); diagnosticLogger.info("diagnostics", "Health check completed", result); }}>Run health check</button><button onClick={() => download(new Blob([JSON.stringify({ diagnostics, logs: diagnosticLogger.export(), performance: metrics }, null, 2)], { type: "application/json" }), "novelverse-diagnostics.json")}>Export safe report</button></div>{diagnostics && <div className="diagnostics" aria-live="polite">{Object.entries(diagnostics).filter(([key]) => key !== "details").map(([key, value]) => <div key={key}><span>{key}</span><b>{String(value)}</b></div>)}</div>}<h3>Performance</h3><pre>{JSON.stringify(metrics, null, 2)}</pre></section>}
    {tab === "exports" && <section className="panel"><h2>Export Center</h2><div className="export-grid">{[["wav", "WAV master"], ["project-package", "Project package"], ["production-report", "Production report"], ["diagnostics-report", "Diagnostics report"]].map(([type, label]) => <button onClick={() => exportFile(type)} key={type}>{label}<small>Download</small></button>)}</div></section>}
    {tab === "settings" && <section className="panel"><h2>Settings</h2><label className="settings-search"><span>Search settings</span><input type="search" value={settingsQuery} onChange={(event) => setSettingsQuery(event.target.value)} placeholder="Pipeline, worker, mixer…" /></label><div className="settings">{settingGroups.map(([name, values]) => <fieldset key={name}><legend>{name}</legend>{Object.keys(values).length ? Object.entries(values).map(([key, value]) => <label key={key}><span>{key}</span><input type="checkbox" checked={Boolean(value)} onChange={(event) => saveSettings({ ...state.settings, [name]: { ...values, [key]: event.target.checked } }, "Settings saved.")} /></label>) : <small>Uses recommended defaults.</small>}</fieldset>)}</div><div className="actions"><button onClick={() => saveSettings(resetBetaSettings(), "Defaults restored.")}>Reset to defaults</button><button onClick={() => download(exportBetaSettings(state.settings), "novelverse-settings.json")}>Export settings</button><label className="file-button">Import settings<input type="file" accept="application/json" onChange={async (event) => { try { saveSettings(importBetaSettings(await event.target.files[0]?.text()), "Settings imported."); } catch (error) { setNotice(error.message); } event.target.value = ""; }} /></label></div><p role="status" aria-live="polite">{notice}</p></section>}
    {tab === "errors" && <section className="panel"><h2>Error Center</h2>{state.errors.length ? state.errors.map((error) => <div className="error" key={error.id}><b>{error.stage}</b> {error.message}</div>) : <p>No production errors. Systems nominal.</p>}</section>}
  </main>;
}
export default BetaDashboard;
