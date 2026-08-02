import { useEffect, useMemo, useRef, useState } from "react";
import { parseBook } from "../lib/bookImport.js";
import { getImportPersistenceError } from "../lib/bookImportError.js";
import { importChapterBatch } from "../lib/bookImportPersistence.js";
import { compareImportFiles, createQueueFiles, DEFAULT_IMPORT_BATCH_SIZE, estimateRemaining, formatDuration, importPreview, prepareQueuedChapters, queueTotals } from "../lib/chapterImportQueue.js";
import { clearImportQueue, loadImportQueue, saveImportQueue } from "../lib/chapterImportQueueStore.js";

const acceptedFormats = ".txt,.fb2,.epub";
const batchSize = DEFAULT_IMPORT_BATCH_SIZE;

function BookImport({ novel, currentChapters = [], onComplete, onCancel }) {
  const inputRef = useRef(null);
  const runningRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [startedAt, setStartedAt] = useState(0);
  const [running, setRunning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [restored, setRestored] = useState(false);

  const persist = async (nextFiles, nextStartedAt = startedAt) => {
    setFiles(nextFiles);
    await saveImportQueue(novel.id, { files: nextFiles, batchSize, startedAt: nextStartedAt });
  };

  const runQueue = async (sourceFiles = files, savedStartedAt = startedAt) => {
    if (runningRef.current || !sourceFiles.some((file) => file.status === "queued")) return;
    runningRef.current = true;
    setRunning(true);
    const queueStartedAt = savedStartedAt || Date.now();
    setStartedAt(queueStartedAt);
    const queue = sourceFiles.map((file) => ({ ...file }));

    for (let fileIndex = 0; fileIndex < queue.length; fileIndex += 1) {
      let item = queue[fileIndex];
      if (item.status !== "queued") continue;
      let checkpointAt = Date.now();
      try {
        item = { ...item, status: "running", error: "" };
        queue[fileIndex] = item;
        await persist([...queue], queueStartedAt);
        for (let batchIndex = item.completedBatches; batchIndex < item.totalBatches; batchIndex += 1) {
          const batch = item.chapters.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);
          const result = await importChapterBatch(novel.id, batch);
          const completedAt = Date.now();
          item = { ...item, added: item.added + Number(result.added || 0), skipped: item.skipped + Number(result.skipped || 0), completedBatches: batchIndex + 1, durationMs: item.durationMs + completedAt - checkpointAt };
          checkpointAt = completedAt;
          queue[fileIndex] = item;
          await persist([...queue], queueStartedAt);
        }
        item = { ...item, status: "completed", durationMs: item.durationMs + Date.now() - checkpointAt };
      } catch (error) {
        item = { ...item, status: "failed", failed: Math.max(1, item.chapters.length - item.completedBatches * batchSize), durationMs: item.durationMs + Date.now() - checkpointAt, error: getImportPersistenceError(error) };
      }
      queue[fileIndex] = item;
      await persist([...queue], queueStartedAt);
    }
    runningRef.current = false;
    setRunning(false);
    onComplete?.(queueTotals(queue));
  };

  useEffect(() => {
    let active = true;
    loadImportQueue(novel?.id).then((saved) => {
      if (!active || !saved?.files?.length) return;
      const recovered = saved.files.map((file) => file.status === "running" ? { ...file, status: "queued" } : file).sort(compareImportFiles);
      setFiles(recovered);
      setStartedAt(saved.startedAt || Date.now());
      setRestored(true);
      if (recovered.some((file) => file.status === "queued" && file.chapters)) setTimeout(() => runQueue(recovered, saved.startedAt), 0);
    }).catch(() => {});
    return () => { active = false; };
    // Queue recovery is intentionally performed once per opened novel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novel?.id]);

  const addFiles = async (selected) => {
    const supported = [...selected].filter((file) => /\.(txt|fb2|epub)$/i.test(file.name));
    if (!supported.length || analyzing || running) return;
    setAnalyzing(true);
    const queue = [...files.filter((file) => !["completed", "failed"].includes(file.status)), ...createQueueFiles(supported)].sort(compareImportFiles);
    const reserved = new Set(currentChapters.map((chapter) => Number(chapter.number)));
    queue.filter((item) => item.chapters).forEach((item) => item.chapters.forEach((chapter) => reserved.add(chapter.number)));
    for (let index = 0; index < queue.length; index += 1) {
      let item = queue[index];
      if (item.chapters) continue;
      try {
        const parsed = await parseBook(item.file);
        const prepared = prepareQueuedChapters(parsed.chapters, [...reserved]);
        prepared.additions.forEach((chapter) => reserved.add(chapter.number));
        item = { ...item, chapters: prepared.additions, detected: parsed.chapters.length, skipped: prepared.skipped, totalBatches: Math.ceil(prepared.additions.length / batchSize) };
      } catch (error) {
        item = { ...item, status: "failed", failed: 1, error: getImportPersistenceError(error) };
      }
      queue[index] = item;
      await persist([...queue], 0);
    }
    setStartedAt(0);
    setAnalyzing(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const retryFailed = () => {
    const next = files.map((file) => file.status === "failed" && file.chapters ? { ...file, status: "queued", failed: 0, error: "" } : file);
    runQueue(next);
  };
  const reset = async () => { await clearImportQueue(novel?.id); setFiles([]); setStartedAt(0); setRestored(false); };

  const totals = useMemo(() => queueTotals(files), [files]);
  const preview = useMemo(() => importPreview(files, currentChapters.length), [files, currentChapters.length]);
  const currentIndex = files.findIndex((file) => file.status === "running");
  const current = currentIndex >= 0 ? files[currentIndex] : null;
  const processed = totals.added + totals.skipped + totals.failed;
  const overall = totals.detected ? Math.min(100, Math.round(processed / totals.detected * 100)) : 0;
  const finished = files.length > 0 && files.every((file) => ["completed", "failed"].includes(file.status));
  const ready = files.some((file) => file.status === "queued" && file.chapters);
  const eta = estimateRemaining(startedAt, totals.added + totals.skipped, totals.detected);

  return <div className="book-import">
    <header className="book-import__header"><div><h2>Final Import System</h2><p>Import into <strong>{novel?.title}</strong> sequentially, with a checkpoint every 100 chapters.</p></div><span className="book-import__local">Auto-resume enabled</span></header>
    <div className={`book-import__dropzone${dragging ? " is-dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
      <strong>Drop chapter files here</strong><span>TXT, FB2 or EPUB · multiple files · naturally sorted</span>
      <button type="button" disabled={running || analyzing} onClick={() => inputRef.current?.click()}>{analyzing ? "Detecting chapters…" : "Choose files"}</button>
      <input ref={inputRef} type="file" multiple accept={acceptedFormats} onChange={(event) => addFiles(event.target.files)} />
      <small>Files and completed batch checkpoints remain on this device if the browser closes.</small>
    </div>
    {files.length > 0 && <>
      <section className="book-import__impact"><h3>Import preview</h3><dl><div><dt>Current chapters</dt><dd>{preview.current}</dd></div><div><dt>Detected chapters</dt><dd>{preview.detected}</dd></div><div><dt>Duplicates</dt><dd>{preview.duplicates}</dd></div><div><dt>Will be added</dt><dd>{preview.additions}</dd></div><div className="total"><dt>Final total</dt><dd>{preview.finalTotal}</dd></div></dl></section>
      <section className="book-import__queue-progress" aria-live="polite">
        <div className="book-import__progress"><div><span>Overall progress</span><b>{overall}%</b></div><progress max="100" value={overall}>{overall}%</progress></div>
        <dl><div><dt>File</dt><dd>{Math.max(totals.completed + totals.failedFiles, currentIndex + 1)} / {files.length}</dd></div><div><dt>Current file</dt><dd>{current?.name || (finished ? "Finished" : "Ready")}</dd></div><div><dt>Batch</dt><dd>{current ? `${current.completedBatches} / ${current.totalBatches}` : "—"}</dd></div><div><dt>Imported</dt><dd>{totals.added.toLocaleString()} / {totals.detected.toLocaleString()} chapters</dd></div><div><dt>ETA</dt><dd>{eta ? formatDuration(eta) : "—"}</dd></div><div><dt>Estimated remaining time</dt><dd>{eta ? formatDuration(eta) : "—"}</dd></div></dl>
      </section>
      {restored && running && <p className="book-import__resume">Recovered queue: continuing automatically from the last saved batch.</p>}
      <section className="book-import__file-list"><h3>Automatically sorted files</h3>{files.map((file, index) => <article key={file.id} className={`is-${file.status}`}><span>{index + 1}</span><div><strong>{file.name}</strong><small>{file.error || file.status}</small></div><dl><div><dt>Detected</dt><dd>{file.detected || "—"}</dd></div><div><dt>Imported</dt><dd>{file.added}</dd></div><div><dt>Skipped</dt><dd>{file.skipped}</dd></div><div><dt>Batches</dt><dd>{file.completedBatches} / {file.totalBatches || "—"}</dd></div></dl></article>)}</section>
      {finished && <section className="book-import__result" role="status"><h3>Final report</h3><dl><div><dt>Imported</dt><dd>{totals.added}</dd></div><div><dt>Skipped</dt><dd>{totals.skipped}</dd></div><div><dt>Failed</dt><dd>{totals.failedFiles}</dd></div><div><dt>Duration</dt><dd>{formatDuration(files.reduce((sum, file) => sum + file.durationMs, 0))}</dd></div><div><dt>Total chapters in novel</dt><dd>{currentChapters.length + totals.added}</dd></div></dl></section>}
      <footer className="book-import__actions"><button type="button" className="secondary" disabled={running || analyzing} onClick={() => { reset(); onCancel?.(); }}>Cancel</button>{finished && files.some((file) => file.status === "failed" && file.chapters) && <button type="button" onClick={retryFailed}>Retry failed files</button>}{!finished && <button type="button" disabled={running || analyzing || !ready} onClick={() => runQueue()}>{running ? "Importing…" : "Start import"}</button>}{finished && <button type="button" onClick={reset}>Done</button>}</footer>
    </>}
  </div>;
}

export default BookImport;
