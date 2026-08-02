import { useEffect, useMemo, useRef, useState } from "react";
import { parseBook } from "../lib/bookImport.js";
import { getImportPersistenceError } from "../lib/bookImportError.js";
import { importChapterBatch, MAX_IMPORT_BATCH_SIZE } from "../lib/bookImportPersistence.js";
import { createQueueFiles, DEFAULT_IMPORT_BATCH_SIZE, estimateRemaining, formatDuration, normalizeBatchSize, prepareQueuedChapters, queueTotals } from "../lib/chapterImportQueue.js";
import { clearImportQueue, loadImportQueue, saveImportQueue } from "../lib/chapterImportQueueStore.js";

const acceptedFormats = ".txt,.fb2,.epub";

function BookImport({ novel, currentChapters = [], onComplete, onCancel }) {
  const inputRef = useRef(null);
  const runningRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [batchSize, setBatchSize] = useState(DEFAULT_IMPORT_BATCH_SIZE);
  const [startedAt, setStartedAt] = useState(0);
  const [running, setRunning] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let active = true;
    loadImportQueue(novel?.id).then((saved) => {
      if (!active || !saved?.files?.length) return;
      setFiles(saved.files.map((file) => file.status === "running" ? { ...file, status: "queued" } : file));
      setBatchSize(normalizeBatchSize(saved.batchSize));
      setStartedAt(saved.startedAt || Date.now());
      setRestored(true);
    }).catch(() => {});
    return () => { active = false; };
  }, [novel?.id]);

  const persist = async (nextFiles, nextStartedAt = startedAt) => {
    setFiles(nextFiles);
    await saveImportQueue(novel.id, { files: nextFiles, batchSize, startedAt: nextStartedAt });
  };

  const addFiles = (selected) => {
    const supported = [...selected].filter((file) => /\.(txt|fb2|epub)$/i.test(file.name));
    if (!supported.length) return;
    const next = [...files.filter((file) => file.status !== "completed" && file.status !== "failed"), ...createQueueFiles(supported)];
    setFiles(next);
    saveImportQueue(novel.id, { files: next, batchSize, startedAt: 0 }).catch(() => {});
    if (inputRef.current) inputRef.current.value = "";
  };

  const runQueue = async (sourceFiles = files) => {
    if (runningRef.current || !sourceFiles.some((file) => file.status === "queued")) return;
    runningRef.current = true;
    setRunning(true);
    const queueStartedAt = startedAt || Date.now();
    setStartedAt(queueStartedAt);
    let queue = sourceFiles.map((file) => ({ ...file }));
    const reserved = new Set(currentChapters.map((chapter) => Number(chapter.number)));
    queue.forEach((file) => {
      if (file.chapters) file.chapters.slice(0, file.completedBatches * batchSize).forEach((chapter) => reserved.add(chapter.number));
    });

    for (let fileIndex = 0; fileIndex < queue.length; fileIndex += 1) {
      let item = queue[fileIndex];
      if (item.status !== "queued") continue;
      const fileStartedAt = Date.now();
      let checkpointAt = fileStartedAt;
      try {
        item = { ...item, status: "running", error: "" };
        queue[fileIndex] = item;
        await persist([...queue], queueStartedAt);
        if (!item.chapters) {
          const parsed = await parseBook(item.file);
          const prepared = prepareQueuedChapters(parsed.chapters, [...reserved]);
          item = { ...item, chapters: prepared.additions, detected: parsed.chapters.length, skipped: prepared.skipped,
            totalBatches: Math.ceil(prepared.additions.length / batchSize) };
          queue[fileIndex] = item;
          await persist([...queue], queueStartedAt);
        }
        for (let batchIndex = item.completedBatches; batchIndex < item.totalBatches; batchIndex += 1) {
          const batch = item.chapters.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);
          const result = await importChapterBatch(novel.id, batch);
          const completedAt = Date.now();
          batch.forEach((chapter) => reserved.add(chapter.number));
          item = { ...item, added: item.added + Number(result.added || 0), skipped: item.skipped + Number(result.skipped || 0),
            completedBatches: batchIndex + 1, durationMs: item.durationMs + (completedAt - checkpointAt) };
          checkpointAt = completedAt;
          queue[fileIndex] = item;
          await persist([...queue], queueStartedAt);
        }
        item = { ...item, status: "completed", durationMs: item.durationMs + (Date.now() - checkpointAt) };
      } catch (error) {
        item = { ...item, status: "failed", failed: Math.max(1, (item.chapters?.length || item.detected) - item.completedBatches * batchSize),
          durationMs: item.durationMs + (Date.now() - checkpointAt), error: getImportPersistenceError(error) };
      }
      queue[fileIndex] = item;
      await persist([...queue], queueStartedAt);
    }
    runningRef.current = false;
    setRunning(false);
    onComplete?.(queueTotals(queue));
  };

  const retryFailed = () => {
    const next = files.map((file) => file.status === "failed" ? { ...file, status: "queued", failed: 0, error: "" } : file);
    setFiles(next);
    runQueue(next);
  };

  const reset = async () => {
    await clearImportQueue(novel?.id);
    setFiles([]); setStartedAt(0); setRestored(false);
  };

  const totals = useMemo(() => queueTotals(files), [files]);
  const currentIndex = files.findIndex((file) => file.status === "running");
  const current = currentIndex >= 0 ? files[currentIndex] : null;
  const processed = totals.added + totals.skipped + totals.failed;
  const overall = totals.detected ? Math.min(100, Math.round(processed / totals.detected * 100)) : 0;
  const finished = files.length > 0 && files.every((file) => ["completed", "failed"].includes(file.status));
  const eta = estimateRemaining(startedAt, totals.added + totals.skipped, totals.detected);

  return <div className="book-import">
    <header className="book-import__header"><div><h2>Import Chapters</h2><p>Queue chapters directly into <strong>{novel?.title}</strong>, one file and one batch at a time.</p></div><span className="book-import__local">Resumable queue</span></header>
    <div className={`book-import__dropzone${dragging ? " is-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
      <strong>Drop chapter files here</strong><span>TXT, FB2 or EPUB · select multiple files</span>
      <button type="button" disabled={running} onClick={() => inputRef.current?.click()}>Choose files</button>
      <input ref={inputRef} type="file" multiple accept={acceptedFormats} onChange={(event) => addFiles(event.target.files)} />
      <small>Files and completed batch checkpoints are kept on this device for recovery.</small>
    </div>

    {files.length > 0 && <>
      <section className="book-import__queue-progress" aria-live="polite">
        <div className="book-import__progress"><div><span>Overall progress</span><b>{overall}%</b></div><progress max="100" value={overall}>{overall}%</progress></div>
        <dl><div><dt>Files</dt><dd>{Math.max(totals.completed + totals.failedFiles, currentIndex + 1)} / {files.length}</dd></div><div><dt>Current file</dt><dd>{current?.name || (finished ? "Finished" : "Ready")}</dd></div><div><dt>Batch</dt><dd>{current ? `${current.completedBatches} / ${current.totalBatches || "—"}` : "—"}</dd></div><div><dt>Imported chapters</dt><dd>{totals.added.toLocaleString()} / {totals.detected.toLocaleString()}</dd></div><div><dt>Elapsed time</dt><dd>{formatDuration(startedAt ? Date.now() - startedAt : 0)}</dd></div><div><dt>Estimated remaining</dt><dd>{eta ? formatDuration(eta) : "—"}</dd></div></dl>
      </section>
      <label className="book-import__batch-size">Chapters per batch <input type="number" min="1" max={MAX_IMPORT_BATCH_SIZE} disabled={running || files.some((file) => file.chapters)} value={batchSize} onChange={(event) => setBatchSize(normalizeBatchSize(event.target.value))} /><small>Maximum 100 chapters per database call.</small></label>
      {restored && !running && !finished && <p className="book-import__resume">A saved import queue was recovered. Resume from the last completed batch.</p>}
      <section className="book-import__file-list"><h3>Files</h3>{files.map((file, index) => <article key={file.id} className={`is-${file.status}`}><span>{index + 1}</span><div><strong>{file.name}</strong><small>{file.error || file.status}</small></div><dl><div><dt>Detected</dt><dd>{file.detected || "—"}</dd></div><div><dt>Added</dt><dd>{file.added}</dd></div><div><dt>Skipped duplicates</dt><dd>{file.skipped}</dd></div><div><dt>Duration</dt><dd>{formatDuration(file.durationMs)}</dd></div></dl></article>)}</section>
      {finished && <section className="book-import__result" role="status"><h3>Final summary</h3><dl><div><dt>Files imported</dt><dd>{totals.completed}</dd></div><div><dt>Chapters added</dt><dd>{totals.added}</dd></div><div><dt>Duplicates skipped</dt><dd>{totals.skipped}</dd></div><div><dt>Errors</dt><dd>{totals.failedFiles}</dd></div><div><dt>Total chapters in novel</dt><dd>{currentChapters.length + totals.added}</dd></div></dl></section>}
      <footer className="book-import__actions"><button type="button" className="secondary" disabled={running} onClick={() => { reset(); onCancel?.(); }}>Cancel</button>{finished && totals.failedFiles > 0 && <button type="button" onClick={retryFailed}>Retry failed files</button>}{!finished && <button type="button" disabled={running} onClick={() => runQueue()}>{running ? "Importing…" : restored ? "Resume import" : "Start import"}</button>}{finished && <button type="button" onClick={reset}>Done</button>}</footer>
    </>}
  </div>;
}

export default BookImport;
