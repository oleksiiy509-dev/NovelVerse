import { useMemo, useRef, useState } from "react";
import { getBookStatistics, parseBook, validateBookChapters } from "../lib/bookImport.js";
import { saveImportedBookDraft } from "../lib/bookImportPersistence.js";

const acceptedFormats = ".txt,.fb2,.epub,.docx,.pdf";

function BookImport() {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [book, setBook] = useState(null);
  const [selected, setSelected] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [saving, setSaving] = useState(false);

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

  const updateMetadata = (patch) => setBook((current) => ({ ...current, metadata: { ...current.metadata, ...patch } }));

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
    if (!book || !book.metadata.title.trim()) return setStatus("A title is required before saving.");
    setSaving(true);
    setStatus("Saving draft to Supabase…");
    try {
      const id = await saveImportedBookDraft(book);
      setStatus(`Draft saved successfully (book ${id}).`);
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
    setStatus("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const chapter = book?.chapters[selected];
  const statistics = useMemo(() => getBookStatistics(book?.chapters), [book?.chapters]);
  const warnings = useMemo(() => book ? [...book.warnings, ...validateBookChapters(book.chapters)] : [], [book]);
  return (
    <div className="book-import">
      <header className="book-import__header">
        <div><h2>Import Book</h2><p>Parse and prepare a book entirely in your browser.</p></div>
        <span className="book-import__local">Local only</span>
      </header>

      {!book && <div
        className={`book-import__dropzone${dragging ? " is-dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); importFile(event.dataTransfer.files[0]); }}
      >
        <strong>Drop your book here</strong>
        <span>TXT, FB2, EPUB, DOCX or PDF</span>
        <button type="button" onClick={() => inputRef.current?.click()}>Choose file</button>
        <input ref={inputRef} type="file" accept={acceptedFormats} onChange={(event) => importFile(event.target.files[0])} />
        <small>Files remain on this device and are never uploaded automatically.</small>
      </div>}

      {!!progress && <div className="book-import__progress" aria-live="polite">
        <div><span>{status}</span><b>{progress}%</b></div>
        <progress max="100" value={progress}>{progress}%</progress>
      </div>}

      {book && <>
        <section className="book-import__summary">
          {book.metadata.cover && <img src={book.metadata.cover} alt="Detected book cover" />}
          <div className="book-import__metadata"><label>Title<input value={book.metadata.title} onChange={(event) => updateMetadata({ title: event.target.value })} /></label><label>Author<input value={book.metadata.author} onChange={(event) => updateMetadata({ author: event.target.value })} /></label><label>Language<input value={book.metadata.language} onChange={(event) => updateMetadata({ language: event.target.value })} /></label></div>
          <dl><div><dt>Chapters</dt><dd>{statistics.chapters}</dd></div><div><dt>Words</dt><dd>{statistics.words.toLocaleString()}</dd></div><div><dt>Reading time</dt><dd>{statistics.readingMinutes} min</dd></div><div><dt>Encoding</dt><dd>{book.encoding}</dd></div></dl>
        </section>
        <label className="book-import__description">Description<textarea value={book.metadata.description} onChange={(event) => updateMetadata({ description: event.target.value })} /></label>
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
          <button type="button" className="secondary" onClick={cancel}>Cancel</button>
          <button type="button" onClick={saveDraft} disabled={saving || !book.metadata.title.trim()}>{saving ? "Saving…" : "Save Draft"}</button>
        </footer>
      </>}
    </div>
  );
}

export default BookImport;
