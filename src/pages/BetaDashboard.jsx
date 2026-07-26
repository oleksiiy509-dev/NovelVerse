import { useCallback, useEffect, useMemo, useState } from "react";
import { BackgroundQueue, BetaRepository, BETA_STAGES, buildExport, collectDiagnostics, performanceSnapshot } from "../lib/betaIntegration";
import "../styles/BetaDashboard.css";

const fmt = (ms) => ms == null ? "—" : `${Math.ceil(ms / 1000)}s`;
function BetaDashboard() {
  const repository = useMemo(() => new BetaRepository(), []);
  const [state, setState] = useState(() => repository.snapshot());
  const [diagnostics, setDiagnostics] = useState(null);
  const [tab, setTab] = useState("pipeline");
  const refresh = useCallback(() => setState(repository.snapshot()), [repository]);
  const queue = useMemo(() => new BackgroundQueue({ repository, onUpdate: refresh }), [repository, refresh]);
  useEffect(() => { if (repository.state.settings.pipeline.autoResume) queue.resumeAll(); }, [queue, repository]);
  const active = [...state.queue].reverse().find(({ status }) => ["running", "queued", "failed"].includes(status)) || state.queue.at(-1);
  const metrics = useMemo(() => performanceSnapshot(state.queue), [state.queue]);
  const start = async () => { let project = state.projects[0]; if (!project) project = repository.upsertProject({ name: "Untitled Beta Project", chapters: ["Chapter 1"] }); const job = queue.add({ projectId: project.id, chapterIds: project.chapters }); refresh(); await queue.run(job.id, { project }); };
  const exportFile = (type) => { const project = state.projects[0] || { id: "draft", name: "Draft" }; const blob = buildExport(type, project, type === "diagnostics-report" ? diagnostics || {} : { queue: state.queue }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `novelverse-${type}.${type === "wav" ? "wav" : "json"}`; link.click(); URL.revokeObjectURL(url); };
  return <main className="beta-shell">
    <header className="beta-hero"><div><span className="eyebrow">BETA INTEGRATION V1</span><h1>Production Control</h1><p>One workspace from manuscript analysis to finished audiobook.</p></div><button className="primary" onClick={start}>▶ Run complete pipeline</button></header>
    {!state.firstLaunchComplete && <section className="wizard"><b>Welcome to NovelVerse Beta</b><span>Connect the local worker, choose defaults, then launch your first production.</span><button onClick={() => { repository.state.firstLaunchComplete = true; repository.save(); refresh(); }}>Finish setup</button></section>}
    <nav className="beta-tabs">{["pipeline", "projects", "diagnostics", "exports", "settings", "errors"].map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</nav>
    {tab === "pipeline" && <><section className="metric-grid"><article><small>QUEUE</small><strong>{metrics.queueSize}</strong><span>active jobs</span></article><article><small>PROGRESS</small><strong>{active?.progress || 0}%</strong><span>{active?.status || "ready"}</span></article><article><small>ELAPSED</small><strong>{fmt(active?.elapsedMs)}</strong><span>remaining {fmt(active?.remainingMs)}</span></article><article><small>CACHE</small><strong>{metrics.cacheHits}/{metrics.cacheMisses}</strong><span>hits / misses</span></article></section>
      <section className="stage-grid">{BETA_STAGES.map((stage, index) => { const complete = (active?.stageIndex || 0) > index || active?.status === "completed"; const running = active?.currentStage === stage.id; return <article className={`stage ${complete ? "complete" : ""} ${running ? "running" : ""}`} key={stage.id}><span>{complete ? "✓" : String(index + 1).padStart(2, "0")}</span><div><b>{stage.label}</b><small>{running ? "Running" : complete ? "Completed" : "Waiting"}</small></div>{running && <progress value={active.progress} max="100" />}</article>; })}</section>
      <div className="actions"><button onClick={() => active && queue.pause(active.id)}>Stop</button><button onClick={() => active && queue.run(active.id)}>Resume</button><button onClick={() => active && queue.stop(active.id)}>Cancel</button></div></>}
    {tab === "projects" && <section className="panel"><h2>Project Manager</h2>{state.projects.map((project) => <div className="row" key={project.id}><b>{project.name}</b><span>{project.updatedAt}</span><button>Open</button><button onClick={() => { repository.duplicate(project.id); refresh(); }}>Duplicate</button><button onClick={() => { repository.archive(project.id); refresh(); }}>Archive</button><button onClick={() => { repository.delete(project.id); refresh(); }}>Delete</button></div>)}<h3>Archive</h3>{state.archivedProjects.map((project) => <div className="row" key={project.id}><b>{project.name}</b><button onClick={() => { repository.restore(project.id); refresh(); }}>Restore</button></div>)}</section>}
    {tab === "diagnostics" && <section className="panel"><h2>Beta Diagnostics</h2><button className="primary" onClick={async () => setDiagnostics(await collectDiagnostics())}>Run health check</button>{diagnostics && <div className="diagnostics">{Object.entries(diagnostics).map(([key, value]) => <div key={key}><span>{key}</span><b>{String(value)}</b></div>)}</div>}<h3>Performance</h3><pre>{JSON.stringify(metrics, null, 2)}</pre></section>}
    {tab === "exports" && <section className="panel"><h2>Export Center</h2><div className="export-grid">{[["wav", "WAV master"], ["project-package", "Project package"], ["production-report", "Production report"], ["diagnostics-report", "Diagnostics report"]].map(([type, label]) => <button onClick={() => exportFile(type)} key={type}>{label}<small>Download</small></button>)}</div></section>}
    {tab === "settings" && <section className="panel"><h2>Beta Settings</h2><div className="settings">{Object.keys(state.settings).map((name) => <label key={name}><span>{name}</span><input type="checkbox" defaultChecked /></label>)}</div></section>}
    {tab === "errors" && <section className="panel"><h2>Error Center</h2>{state.errors.length ? state.errors.map((error) => <div className="error" key={error.id}><b>{error.stage}</b> {error.message}</div>) : <p>No production errors. Systems nominal.</p>}</section>}
  </main>;
}
export default BetaDashboard;
