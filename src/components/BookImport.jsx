import { useMemo, useRef, useState } from "react";
import { getBookStatistics, parseBook, validateBookChapters } from "../lib/bookImport.js";
import { planChapterMerge } from "../lib/bookImportMerge.js";
import { importChaptersIntoNovel } from "../lib/bookImportPersistence.js";

const acceptedFormats = ".txt,.fb2,.epub,.docx,.pdf";

function BookImport({ novel, currentChapters = [], onComplete, onCancel }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [book, setBook] = useState(null);
  const [selected, setSelected] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState(null);

  const importFile = async (file) => {
    if (!file) return;
    setStatus("Parsing locally…");
    setProgress(5);
    try {
      const parsed = await parseBook(file, setProgress);
      setBook({ ...parsed, sourceName: file.name });
      setSelected(0);
      setStatus("Parsing complete. Nothing has been uploaded.");
    } catch (error) {
      setBook(null);
      setProgress(0);
      setStatus(error instanceof Error ? error.message : "The file could not be parsed.");
    }
  };

  const updateChapter = (index, patch) => setBook((current) => ({
    ...current,
    chapters: current.chapters.map((chapter, chapterIndex) => chapterIndex === index ? { ...chapter, ...patch } : chapter),
  }));

  const moveChapter = (offset) => {
    const target = selected + offset;
    if (!book || target < 0 || target >= book.chapters.length) return;
    const chapters = [...book.chapters];
    [chapters[selected], chapters[target]] = [chapters[target], chapters[selected]];
    setBook({ ...book, chapters });
    setSelected(target);
  };

  const mergeNext = () => {
    if (!book || selected >= book.chapters.length - 1) return;
    const chapters = [...book.chapters];
    chapters[selected] = { ...chapters[selected], content: `${chapters[selected].content}\n\n${chapters[selected + 1].content}` };
    chapters.splice(selected + 1, 1);
    setBook({ ...book, chapters });
  };

  const splitChapter = () => {
    const chapter = book?.chapters[selected];
    if (!chapter || cursor <= 0 || cursor >= chapter.content.length) return;
    const chapters = [...book.chapters];
    chapters.splice(selected, 1,
      { ...chapter, content: chapter.content.slice(0, cursor).trim() },
      { id: crypto.randomUUID(), title: `${chapter.title} — Part 2`, content: chapter.content.slice(cursor).trim() });
    setBook({ ...book, chapters });
  };

  const deleteChapter = () => {
    if (!book || book.chapters.length === 1) return;
    setBook({ ...book, chapters: book.chapters.filter((_, index) => index !== selected) });
    setSelected(Math.max(0, selected - 1));
  };

  const saveDraft = async () => {
    if (!book || !novel?.id) return;
    setSaving(true);
    setStatus("Saving draft to Supabase…");
    try {
      const result = await importChaptersIntoNovel(novel.id, book.chapters, currentChapters.map((item) => item.number));
      setSummary(result);
      setStatus("Import complete.");
      onComplete?.(result);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The draft could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (book?.metadata.cover?.startsWith("blob:")) URL.revokeObjectURL(book.metadata.cover);
    setBook(null);
    setProgress(0);
    setStatus(""); setSummary(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const chapter = book?.chapters[selected];
  const statistics = useMemo(() => getBookStatistics(book?.chapters), [book?.chapters]);
  const warnings = useMemo(() => book ? [...book.warnings, ...validateBookChapters(book.chapters)] : [], [book]);
  const mergePlan = useMemo(() => planChapterMerge(book?.chapters, currentChapters.map((item) => item.number)), [book?.chapters, currentChapters]);
  const counts = { current: currentChapters.length, incoming: book?.chapters.length || 0, duplicates: mergePlan.skipped, added: mergePlan.additions.length, final: currentChapters.length + mergePlan.additions.length };
  return (
    <div className="book-import">
      <header className="book-import__header">
        <div><h2>Import Chapters</h2><p>Import chapters directly into <strong>{novel?.title}</strong>. This novel is always used.</p></div>
        <span className="book-import__local">Local only</span>
      </header>

      {!book && <div
        className={`book-import__dropzone${dragging ? " is-dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); importFile(event.dataTransfer.files[0]); }}
      >
        <strong>Drop chapter files here</strong>
        <span>TXT, FB2, EPUB, DOCX or PDF</span>
        <button type="button" onClick={() => inputRef.current?.click()}>Choose file</button>
        <input ref={inputRef} type="file" accept={acceptedFormats} onChange={(event) => importFile(event.target.files[0])} />
        <small>Files remain on this device and are never uploaded automatically.</small>
      </div>}

      {!!progress && <div className="book-import__progress" aria-live="polite">
        <div><span>{status}</span><b>{progress}%</b></div>
        <progress max="100" value={progress}>{progress}%</progress>
      </div>}

      {summary && <section className="book-import__result" role="status"><h3>Import summary</h3><dl><div><dt>Added:</dt><dd>{summary.added}</dd></div><div><dt>Skipped duplicates:</dt><dd>{summary.skipped}</dd></div><div><dt>Total chapters:</dt><dd>{summary.totalChapters}</dd></div></dl></section>}

      {book && !summary && <>
        <section className="book-import__summary">
          <div className="book-import__cover">{(book.metadata.cover || novel?.cover_url) ? <img src={book.metadata.cover || novel.cover_url} alt="Book cover preview" /> : <span aria-label="No cover detected">No cover</span>}</div>
          <div><h3>{novel?.title}</h3><p>{novel?.author || "Unknown author"}</p></div>
          <dl><div><dt>Parsed chapters</dt><dd>{statistics.chapters}</dd></div><div><dt>Words</dt><dd>{statistics.words.toLocaleString()}</dd></div><div><dt>Estimated reading time</dt><dd>{statistics.readingMinutes} min</dd></div><div><dt>Encoding</dt><dd>{book.encoding}</dd></div></dl>
        </section>
        <section className="book-import__impact" aria-label="Import totals"><h3>Import into current novel</h3><dl><div><dt>Current novel</dt><dd>{novel?.title}</dd></div><div><dt>Current chapters</dt><dd>{counts.current}</dd></div><div><dt>Incoming chapters</dt><dd>{counts.incoming}</dd></div><div><dt>Duplicate chapters</dt><dd>{counts.duplicates}</dd></div><div><dt>New chapters</dt><dd>{counts.added}</dd></div><div className="total"><dt>Final total</dt><dd>{counts.final}</dd></div></dl></section>
        {warnings.length > 0 && <section className="book-import__warnings"><strong>Import warnings</strong><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section>}

        <section className="book-import__editor">
          <aside><h3>Parsed chapters <span>{book.chapters.length}</span></h3>{book.chapters.map((item, index) => <button type="button" className={index === selected ? "active" : ""} key={item.id} onClick={() => setSelected(index)}><span>{index + 1}</span>{item.title}</button>)}</aside>
          <div className="book-import__preview">
            <label>Chapter title<input value={chapter.title} onChange={(event) => updateChapter(selected, { title: event.target.value })} /></label>
            <label>Chapter preview<textarea value={chapter.content} onSelect={(event) => setCursor(event.currentTarget.selectionStart)} onChange={(event) => updateChapter(selected, { content: event.target.value })} /></label>
            <div className="book-import__tools">
              <button type="button" onClick={() => moveChapter(-1)} disabled={selected === 0}>Move up</button>
              <button type="button" onClick={() => moveChapter(1)} disabled={selected === book.chapters.length - 1}>Move down</button>
              <button type="button" onClick={mergeNext} disabled={selected === book.chapters.length - 1}>Merge with next</button>
              <button type="button" onClick={splitChapter} disabled={!cursor}>Split at cursor</button>
              <button type="button" className="danger" onClick={deleteChapter} disabled={book.chapters.length === 1}>Delete</button>
            </div>
          </div>
        </section>
        <footer className="book-import__actions">
          <button type="button" className="secondary" onClick={() => { cancel(); onCancel?.(); }}>Cancel</button>
          <button type="button" onClick={saveDraft} disabled={saving || counts.added === 0}>{saving ? "Importing…" : "Import"}</button>
        </footer>
      </>}
    </div>
  );
}

export default BookImport;
