import { useCallback, useEffect, useRef, useState } from "react";
import { cancelChapterGeneration, createChapterGeneration, getChapterAudio, getChapterGeneration, getVoiceWorkerHealth, openChapterOutputFolder } from "../lib/voiceWorker";
import { prepareNarratedChapterSegments } from "../lib/narrationRendering";
import { startChapterRender } from "../lib/audioProduction";

const terminal = new Set(["Finished", "Failed"]);
const formatDuration = (seconds = 0) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
const formatSize = (bytes = 0) => bytes ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : "—";

export default function ChapterGeneration({ book, chapter, segments, provider = "auto", directorExists = true }) {
  const [jobs, setJobs] = useState([]);
  const [audioUrls, setAudioUrls] = useState({});
  const [health, setHealth] = useState({ label: "Offline", detail: "Checking local Piper…" });
  const [checkingHealth, setCheckingHealth] = useState(false);
  const timer = useRef(null);
  const audio = useRef(new Map());
  const createdUrls = useRef([]);
  const chapterSegments = segments.filter((segment) => String(segment.chapterId) === String(chapter?.id));
  const generationBlockers = directorExists ? [
    !chapter && "No chapter is selected.",
    chapter && !chapterSegments.length && "No narration segments are assigned to this chapter.",
    chapterSegments.some((segment) => typeof segment.text !== "string" || !segment.text.length) && "Every narration segment must contain chapter text.",
    health.label === "Offline" && `Local voice worker is offline: ${health.detail}`,
    health.label === "Error" && `Local voice worker health check failed: ${health.detail}`,
  ].filter(Boolean) : ["Analyze Chapter first"];
  const generationDisabled = generationBlockers.length > 0;
  const generationDisabledReason = generationBlockers.join(" ");

  useEffect(() => () => { clearTimeout(timer.current); createdUrls.current.forEach(URL.revokeObjectURL); }, []);
  useEffect(() => {
    if (generationDisabled) console.warn("Generate Chapter disabled:", generationDisabledReason);
  }, [generationDisabled, generationDisabledReason]);
  const checkHealth = useCallback(async () => {
      setCheckingHealth(true);
      try {
        const result = await getVoiceWorkerHealth();
        const label = result.status === "BUSY" || result.status === "Busy" ? "Busy" : result.online ? "ONLINE" : "Offline";
        const detail = result.piperAvailable === false ? "Piper offline" : result.capabilities?.outputAvailable === false ? "Output folder unavailable" : result.capabilities?.ffmpeg === false ? "FFmpeg missing · WAV output will be used" : result.piperAvailable ? "Piper and FFmpeg ready" : "Local worker connected";
        setHealth({ label, detail, provider: result.selectedProvider });
      } catch { setHealth({ label: "Offline", detail: "Piper offline" }); }
      finally { setCheckingHealth(false); }
  }, []);
  useEffect(() => {
    checkHealth(); const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, [checkHealth]);
  useEffect(() => {
    const active = jobs.find((job) => !terminal.has(job.status));
    if (!active) return undefined;
    timer.current = setTimeout(async () => {
      try {
        const next = await getChapterGeneration(active.id);
        setJobs((items) => items.map((job) => job.id === next.id ? next : job));
        if (next.status === "Finished") {
          const url = URL.createObjectURL(await getChapterAudio(next.id)); createdUrls.current.push(url);
          setAudioUrls((urls) => ({ ...urls, [next.id]: url }));
          setJobs((items) => items.filter((job) => job.id === next.id || job.id !== active.retryOf));
        }
      } catch (error) { setJobs((items) => items.map((job) => job.id === active.id ? { ...job, status: "Failed", error: error.message } : job)); }
    }, 500);
    return () => clearTimeout(timer.current);
  }, [jobs]);

  const generate = async () => {
    const payload = { bookId: book.id, chapterId: chapter.id, chapterNumber: chapter.number, bookTitle: book.title, chapterTitle: chapter.title, language: book.language || "uk", provider: provider === "auto" ? health.provider || "auto" : provider, segments: prepareNarratedChapterSegments(chapterSegments) };
    try {
      const job = await startChapterRender(createChapterGeneration, payload);
      setJobs((items) => [job, ...items.filter((item) => item.id !== job.id)]);
      if (job.status === "Finished") { const url = URL.createObjectURL(await getChapterAudio(job.id)); createdUrls.current.push(url); setAudioUrls((urls) => ({ ...urls, [job.id]: url })); }
    } catch (error) { setJobs((items) => [{ id: `failed-${Date.now()}`, status: "Failed", error: error.message, request: payload }, ...items]); }
  };
  const retry = async (failedJob) => {
    const next = await createChapterGeneration({ bookId: book.id, chapterId: chapter.id, chapterNumber: chapter.number, bookTitle: book.title, chapterTitle: chapter.title, language: book.language || "uk", provider: provider === "auto" ? health.provider || "auto" : provider, segments: prepareNarratedChapterSegments(chapterSegments) });
    const retried = { ...next, retryOf: failedJob.id };
    setJobs((items) => next.status === "Finished" ? [retried, ...items.filter((item) => item.id !== failedJob.id)] : [retried, ...items]);
    if (next.status === "Finished") { const url = URL.createObjectURL(await getChapterAudio(next.id)); createdUrls.current.push(url); setAudioUrls((urls) => ({ ...urls, [next.id]: url })); }
  };
  const download = (job) => {
    const link = document.createElement("a"); link.href = audioUrls[job.id]; link.download = job.fileName || `${chapter.title}.wav`; link.click();
  };

  return <section className="chapter-generation">
    <div className="chapter-generation__heading"><div><h3>Local audio</h3><p>Piper renders and saves the chapter on this PC. Nothing is uploaded.</p><span className={`chapter-generation__health ${health.label.toLowerCase()}`}><i/> {health.label} · {health.detail}</span></div><div className="chapter-generation__heading-actions"><button className="secondary" type="button" onClick={() => checkHealth()} disabled={checkingHealth}>{checkingHealth ? "Checking…" : "Health Check"}</button><button type="button" onClick={generate} disabled={generationDisabled} aria-describedby={generationDisabled ? "chapter-generation-disabled-reason" : undefined}>Generate Chapter</button>{generationDisabled && <p id="chapter-generation-disabled-reason" className="chapter-generation__error" role="status">{generationDisabledReason}</p>}</div></div>
    <div className="chapter-generation__queue" aria-label="Generation queue">{jobs.map((job) => <article key={job.id}>
      <div><strong>{chapter?.title || "Chapter"}</strong><span className={`chapter-generation__status ${job.status.toLowerCase()}`}>{job.status}</span></div>
      {!terminal.has(job.status) && <progress max={job.total || 1} value={job.completed || 0}/>} 
      {job.status === "Finished" && <><dl><div><dt>Audio duration</dt><dd>{formatDuration(job.duration)}</dd></div><div><dt>Output size</dt><dd>{formatSize(job.size)}</dd></div><div><dt>Render time</dt><dd>{(job.generationTime / 1000).toFixed(1)} sec{job.cached ? " · cached" : ""}</dd></div></dl>{job.ffmpegMissing && <p className="chapter-generation__warning">FFmpeg missing · saved as WAV</p>}</>}
      {job.error && <p className="chapter-generation__error">{job.error}</p>}
      {audioUrls[job.id] && <audio controls ref={(element) => element ? audio.current.set(job.id, element) : audio.current.delete(job.id)} preload="metadata" src={audioUrls[job.id]}>Audio playback is unavailable.</audio>}
      <div className="chapter-generation__actions">{!terminal.has(job.status) && <button className="danger" type="button" onClick={() => cancelChapterGeneration(job.id)}>Cancel</button>}{job.status === "Failed" && <button className="secondary" type="button" onClick={() => retry(job)}>Retry</button>}{audioUrls[job.id] && <><button className="secondary" type="button" onClick={() => openChapterOutputFolder(job.id).catch(() => setJobs((items) => items.map((item) => item.id === job.id ? { ...item, error: "Output folder unavailable" } : item)))}>Open Output Folder</button><button className="secondary" type="button" onClick={() => download(job)}>Save locally</button></>}</div>
    </article>)}</div>
  </section>;
}
