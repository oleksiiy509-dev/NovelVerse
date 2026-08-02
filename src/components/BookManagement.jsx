import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AGE_RATINGS, BOOK_STATUSES, LANGUAGES, TRANSLATION_STATUSES, createBook, deleteManagedBook, duplicateChapter, loadManagedBooks, loadManagedChapter, reorderChapters, saveManagedBook, uploadBookAsset, validateBook } from "../lib/bookManagement";
import { generateManagedAudio, importBookFiles } from "../lib/bookWorkflow";
import { isSupabaseConfigured } from "../lib/supabase";

const list = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  const text = String(value).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Plain comma-separated text is the legacy database format.
  }
  return text.split(",").map((item) => item.trim()).filter(Boolean);
};
const chapterDraftKey = (bookId, chapterId) => `novelverse.chapter-draft.${bookId}.${chapterId}`;
export default function BookManagement({ onBooksChange, bookId, createNew = false, initialTab = "Metadata" }) {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]), [selectedId, setSelectedId] = useState(""), [tab, setTab] = useState(initialTab), [chapterId, setChapterId] = useState("");
  const [notice, setNotice] = useState(""), [errors, setErrors] = useState({}), [saving, setSaving] = useState(false), [query, setQuery] = useState("");
  const [importPreview, setImportPreview] = useState([]), [generating, setGenerating] = useState([]), [pasteOpen, setPasteOpen] = useState(false), [pasteText, setPasteText] = useState("");
  const [persistedChapterIds, setPersistedChapterIds] = useState([]);
  const timer = useRef();
  const selected = books.find((book) => String(book.id) === String(selectedId)) || books[0];
  const chapter = selected?.chapters.find((item) => item.id === chapterId);
  const update = (patch) => setBooks((items) => items.map((book) => book.id === selectedId ? { ...book, ...patch } : book));
  const updateChapter = (patch) => update({ chapters: selected.chapters.map((item) => item.id === chapterId ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item) });
  const flash = useCallback((message) => { setNotice(message); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setNotice(""), 2800); }, []);

  useEffect(() => { loadManagedBooks().then((items) => { const normalized = items.map((book) => ({ ...book, genres: list(book.genres) })); const loaded = createNew ? [createBook(), ...normalized] : normalized; const requested = loaded.find((book) => String(book.id) === String(bookId)); setBooks(loaded); setPersistedChapterIds(isSupabaseConfigured ? normalized.flatMap((book) => book.chapters.map((item) => item.id)) : loaded.flatMap((book) => book.chapters.map((item) => item.id))); setSelectedId(createNew ? loaded[0].id : requested?.id || loaded[0]?.id || ""); setTab(initialTab); onBooksChange?.(loaded); }).catch((error) => flash(error.message)); return () => window.clearTimeout(timer.current); }, [bookId, createNew, flash, initialTab, onBooksChange]);
  useEffect(() => { if (!chapter) return; const id = window.setTimeout(() => { localStorage.setItem(chapterDraftKey(selectedId, chapter.id), JSON.stringify(chapter)); flash("Chapter autosaved"); }, 900); return () => window.clearTimeout(id); }, [chapter, flash, selectedId]);
  useEffect(() => {
    if (!isSupabaseConfigured || !chapterId || !chapter || Object.hasOwn(chapter, "content")) return;
    let cancelled = false;
    loadManagedChapter(chapterId).then((loaded) => {
      if (!cancelled && loaded) updateChapter({ content: loaded.content || "" });
    }).catch((error) => flash(error.message));
    return () => { cancelled = true; };
  }, [chapter, chapterId, flash]);

  const persist = async () => { const found = validateBook(selected); setErrors(found); if (Object.keys(found).length) return; const activeChapterIndex = selected.chapters.findIndex((item) => item.id === chapterId); setSaving(true); try { await saveManagedBook(selected, books); setSelectedId(selected.id); if (activeChapterIndex >= 0) setChapterId(selected.chapters[activeChapterIndex].id); setPersistedChapterIds((ids) => [...new Set([...ids, ...selected.chapters.map((item) => item.id)])]); onBooksChange?.(books); flash("All changes saved"); } catch (error) { flash(error.message); } finally { setSaving(false); } };
  const add = () => { const book = createBook(); setBooks((items) => [book, ...items]); setSelectedId(book.id); setTab("Metadata"); flash("New draft created"); };
  const remove = async () => { if (!confirm(`Delete “${selected.title}” and all of its chapters?`)) return; const remaining = books.filter((book) => book.id !== selectedId); await deleteManagedBook(selectedId, remaining); setBooks(remaining); setSelectedId(remaining[0]?.id || ""); onBooksChange?.(remaining); };
  const asset = async (kind, file) => { if (!file) return; try { const url = await uploadBookAsset(selected.id, kind, file); update({ [`${kind}Url`]: url }); flash(`${kind === "cover" ? "Cover" : "Banner"} uploaded`); } catch (error) { flash(error.message); } };
  const addChapter = () => { const item = { id: crypto.randomUUID(), title: `Chapter ${selected.chapters.length + 1}`, content: "<p>Start writing…</p>", audioStatus: "Missing", audioUrl: "", updatedAt: new Date().toISOString() }; update({ chapters: [...selected.chapters, item] }); setChapterId(item.id); };
  const importChapters = async (files) => {
    if (!files.length) return;
    try {
      const imported = await importBookFiles(files);
      const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      const chapters = imported.map((item, index) => ({ id: crypto.randomUUID(), title: item.title || `Chapter ${selected.chapters.length + index + 1}`, content: item.content.split(/\n{2,}/).map((text) => `<p>${escape(text)}</p>`).join(""), audioStatus: "Missing", audioUrl: "", updatedAt: new Date().toISOString() }));
      if (!chapters.length) throw new Error("No chapters were found in the selected files");
      setImportPreview(chapters);
    } catch (error) { flash(error.message); }
  };
  const previewPastedText = () => {
    setPasteOpen(false);
    importChapters([new File([pasteText], "pasted-text.txt", { type: "text/plain" })]);
  };
  const generateAudio = async (item) => {
    if (isSupabaseConfigured && !persistedChapterIds.includes(item.id)) { flash("Save changes before generating chapter audio"); return; }
    setGenerating((ids) => [...ids, item.id]);
    setBooks((items) => items.map((book) => book.id === selectedId ? { ...book, chapters: book.chapters.map((entry) => entry.id === item.id ? { ...entry, audioStatus: "Generating" } : entry) } : book));
    try {
      const audioUrl = await generateManagedAudio(item, selected.language);
      const nextBook = { ...selected, chapters: selected.chapters.map((entry) => entry.id === item.id ? { ...entry, audioStatus: "Ready", audioUrl, audioError: "" } : entry) };
      const nextBooks = books.map((book) => book.id === selectedId ? nextBook : book);
      setBooks(nextBooks);
      await saveManagedBook(nextBook, nextBooks);
      flash(`${item.title} audio is ready`);
    } catch (error) { setBooks((items) => items.map((book) => book.id === selectedId ? { ...book, chapters: book.chapters.map((entry) => entry.id === item.id ? { ...entry, audioStatus: "Error", audioError: error.message } : entry) } : book)); flash(`Could not generate ${item.title}: ${error.message}`); }
    finally { setGenerating((ids) => ids.filter((id) => id !== item.id)); }
  };
  const generateWholeBook = async () => {
    let current = selected;
    const pending = current.chapters.filter(({ audioStatus }) => audioStatus !== "Ready");
    setGenerating(pending.map(({ id }) => id));
    for (const item of pending) {
      current = { ...current, chapters: current.chapters.map((entry) => entry.id === item.id ? { ...entry, audioStatus: "Generating" } : entry) };
      setBooks((items) => items.map((book) => book.id === selectedId ? current : book));
      try {
        const audioUrl = await generateManagedAudio(item, current.language);
        current = { ...current, chapters: current.chapters.map((entry) => entry.id === item.id ? { ...entry, audioStatus: "Ready", audioUrl, audioError: "" } : entry) };
        const nextBooks = books.map((book) => book.id === selectedId ? current : book);
        setBooks(nextBooks);
        await saveManagedBook(current, nextBooks);
      } catch (error) {
        current = { ...current, chapters: current.chapters.map((entry) => entry.id === item.id ? { ...entry, audioStatus: "Error", audioError: error.message } : entry) };
        setBooks((items) => items.map((book) => book.id === selectedId ? current : book));
        flash(`Could not generate ${item.title}: ${error.message}`);
      }
      setGenerating((ids) => ids.filter((id) => id !== item.id));
    }
    if (pending.length && current.chapters.every(({ audioStatus }) => audioStatus === "Ready")) flash("Full audiobook is ready");
  };
  const publish = async () => {
    const published = { ...selected, status: "Published" };
    const found = validateBook(published); setErrors(found);
    if (Object.keys(found).length) { flash(Object.values(found)[0]); return; }
    const nextBooks = books.map((book) => book.id === published.id ? published : book);
    setSaving(true);
    try { await saveManagedBook(published, nextBooks); setBooks(nextBooks); onBooksChange?.(nextBooks); flash("Audiobook published to the public catalog"); }
    catch (error) { flash(error.message); }
    finally { setSaving(false); }
  };
  const shown = books.filter((book) => `${book.title} ${book.author}`.toLowerCase().includes(query.toLowerCase()));
  const hasUnsavedChapters = isSupabaseConfigured && selected?.chapters.some((item) => !persistedChapterIds.includes(item.id));
  const openTab = (item) => {
    setTab(item);
    if (!selectedId) return;
    const suffix = item === "Chapters" ? "/chapters" : item === "Audio" ? "/audio" : "";
    if (["Metadata", "Chapters", "Audio"].includes(item)) navigate(`/admin/books/${selectedId}${suffix}`);
  };

  return <section className="book-cms">
    {pasteOpen && <div className="import-backdrop" role="dialog" aria-modal="true" aria-labelledby="paste-title"><div className="import-preview"><h2 id="paste-title">Paste chapter text</h2><p>Chapter, Глава and Розділ headings are detected automatically.</p><textarea rows="14" autoFocus value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder="Chapter 1 — The beginning…"/><div><button className="secondary" onClick={() => setPasteOpen(false)}>Cancel</button><button disabled={!pasteText.trim()} onClick={previewPastedText}>Preview import</button></div></div></div>}
    {importPreview.length > 0 && <div className="import-backdrop" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="import-preview"><h2 id="import-title">Preview chapter import</h2><p>Review and edit the automatic split before saving these chapters.</p><ol>{importPreview.map((item) => <li key={item.id}><label>Chapter title<input value={item.title} onChange={(event) => setImportPreview((items) => items.map((entry) => entry.id === item.id ? { ...entry, title: event.target.value } : entry))}/></label><label>Chapter text<textarea rows="5" value={item.content.replace(/<[^>]+>/g, "")} onChange={(event) => setImportPreview((items) => items.map((entry) => entry.id === item.id ? { ...entry, content: `<p>${event.target.value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/\n{2,}/g, "</p><p>")}</p>` } : entry))}/></label></li>)}</ol><div><button className="secondary" onClick={() => setImportPreview([])}>Cancel</button><button onClick={() => { update({ chapters: [...selected.chapters, ...importPreview] }); setChapterId(importPreview[0].id); flash(`${importPreview.length} chapters saved`); setImportPreview([]); }}>Save chapters</button></div></div></div>}
    {notice && <div className="cms-toast" role="status">✓ {notice}</div>}
    <div className="cms-toolbar"><div><h2>Book library</h2><p>{books.length} projects · {isSupabaseConfigured ? "Supabase connected" : "Local workspace"}</p></div><label className="cms-search">⌕<input aria-label="Search books" placeholder="Search title or author" value={query} onChange={(e) => setQuery(e.target.value)} /></label><button onClick={() => navigate("/admin/books/new")}>＋ New Book</button></div>
    <div className="cms-layout"><aside className="cms-books">{shown.map((book) => <button key={book.id} className={book.id === selectedId ? "selected" : ""} onClick={() => { setChapterId(""); navigate(`/admin/books/${book.id}`); }}><span className="cms-cover" style={book.coverUrl ? { backgroundImage: `url(${book.coverUrl})` } : {}}>{!book.coverUrl && (typeof book.title === "string" ? book.title : "").slice(0, 2).toUpperCase()}</span><span><b>{book.title}</b><small>{book.author || "Author not set"}</small><em>{book.status}</em></span></button>)}</aside>
    {selected ? <main className="cms-editor"><header className="cms-editor-head"><div><span className="cms-eyebrow">CONTENT MANAGEMENT / {selected.status.toUpperCase()}</span><h2>{selected.title}</h2><p>{selected.chapters.length} chapters · {selected.language} · {selected.ageRating}</p></div><div><button className="cms-danger" onClick={remove}>Delete</button><button onClick={persist} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div></header>
      <nav className="cms-tabs">{["Metadata", "Chapters", "Audio", "Languages", "Publishing"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => openTab(item)}>{item}</button>)}</nav>
      {tab === "Metadata" && <div className="cms-form"><div className="asset-upload cover-upload" style={selected.coverUrl ? { backgroundImage: `url(${selected.coverUrl})` } : {}}><b>Cover art</b><span>Recommended 1600 × 2400</span><label>Upload cover<input type="file" accept="image/*" onChange={(e) => asset("cover", e.target.files[0])}/></label></div><div className="asset-upload banner-upload" style={selected.bannerUrl ? { backgroundImage: `url(${selected.bannerUrl})` } : {}}><b>Book banner</b><span>Recommended 2400 × 900</span><label>Upload banner<input type="file" accept="image/*" onChange={(e) => asset("banner", e.target.files[0])}/></label></div><label>Title<input value={selected.title} onChange={(e) => update({ title: e.target.value })}/>{errors.title && <small>{errors.title}</small>}</label><label>Author<input value={selected.author} onChange={(e) => update({ author: e.target.value })}/>{errors.author && <small>{errors.author}</small>}</label><label>Language<select value={selected.language} onChange={(e) => update({ language: e.target.value })}>{LANGUAGES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Age rating<select value={selected.ageRating} onChange={(e) => update({ ageRating: e.target.value })}>{AGE_RATINGS.map((item) => <option key={item}>{item}</option>)}</select></label><label className="wide">Genres<input value={selected.genres.join(", ")} onChange={(e) => update({ genres: list(e.target.value) })} placeholder="Fantasy, Mystery"/></label><label className="wide">Tags<input value={selected.tags.join(", ")} onChange={(e) => update({ tags: list(e.target.value) })} placeholder="found family, magic"/></label><label className="wide">Description<textarea rows="6" value={selected.description} onChange={(e) => update({ description: e.target.value })}/></label></div>}
      {tab === "Chapters" && <div className="chapter-manager"><aside><div><h3>Chapters</h3><label className="cms-import">Import files<input type="file" multiple accept=".txt,.docx,.zip,.epub,.fb2,.html,.htm,.md,.markdown" onChange={(e) => importChapters([...e.target.files])}/></label><button className="secondary" onClick={() => setPasteOpen(true)}>Paste text</button><button onClick={addChapter}>＋ Add</button></div>{selected.chapters.map((item, index) => <button className={chapterId === item.id ? "active" : ""} key={item.id} onClick={() => setChapterId(item.id)}><i>⋮⋮</i><span><b>{index + 1}. {item.title}</b><small>{item.audioStatus} · {(item.content || "").replace(/<[^>]+>/g, "").length} chars</small></span></button>)}</aside>{chapter ? <article className="chapter-editor"><div className="chapter-actions"><button onClick={() => update({ chapters: reorderChapters(selected.chapters, selected.chapters.indexOf(chapter), selected.chapters.indexOf(chapter) - 1) })}>↑ Move up</button><button onClick={() => update({ chapters: reorderChapters(selected.chapters, selected.chapters.indexOf(chapter), selected.chapters.indexOf(chapter) + 1) })}>↓ Move down</button><button onClick={() => update({ chapters: [...selected.chapters, duplicateChapter(chapter)] })}>Duplicate</button><button className="cms-danger" onClick={() => { update({ chapters: selected.chapters.filter((item) => item.id !== chapter.id) }); setChapterId(""); }}>Delete</button></div><label>Chapter title<input value={chapter.title} onChange={(e) => updateChapter({ title: e.target.value })}/></label><div className="rich-toolbar"><button onMouseDown={(e) => { e.preventDefault(); document.execCommand("bold"); }}>B</button><button onMouseDown={(e) => { e.preventDefault(); document.execCommand("italic"); }}><i>I</i></button><button onMouseDown={(e) => { e.preventDefault(); document.execCommand("formatBlock", false, "h2"); }}>H2</button><span>Autosave on · {new Date(chapter.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div><div className="cms-rich" contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: chapter.content }} onInput={(e) => updateChapter({ content: e.currentTarget.innerHTML })}/></article> : <div className="cms-empty"><b>Select a chapter</b><p>Create, edit, duplicate, import and reorder chapters from this workspace.</p><button onClick={addChapter}>Create first chapter</button></div>}</div>}
      {tab === "Audio" && <div className="audio-manager"><div className="audio-callout"><div><b>Generate the complete audiobook</b><p>{hasUnsavedChapters ? "Save changes before generating audio." : "Creates playable narration for every chapter that does not have audio."}</p></div><button onClick={generateWholeBook} disabled={generating.length > 0 || !selected.chapters.length || hasUnsavedChapters}>{generating.length ? "Generating…" : "Generate entire book"}</button></div>{selected.chapters.map((item, index) => { const chapterIsPersisted = !isSupabaseConfigured || persistedChapterIds.includes(item.id); return <article key={item.id}><span>▶</span><div><b>{index + 1}. {item.title}</b><small>{!chapterIsPersisted ? "Save changes before generating audio" : item.audioStatus === "Ready" ? "Audio ready for preview" : item.audioStatus === "Generating" ? "Generating real narration…" : "No generated audio"}</small></div><em className={item.audioStatus.toLowerCase()}>{item.audioStatus}</em>{item.audioUrl && <audio controls preload="metadata" src={item.audioUrl}>Your browser cannot play this audio.</audio>}<button onClick={() => generateAudio(item)} disabled={generating.includes(item.id) || !chapterIsPersisted}>{generating.includes(item.id) ? "Generating…" : item.audioStatus === "Ready" ? "Regenerate" : "Generate chapter"}</button>{item.audioStatus === "Ready" && <button className="cms-danger" onClick={() => update({ chapters: selected.chapters.map((entry) => entry.id === item.id ? { ...entry, audioStatus: "Missing", audioUrl: "" } : entry) })}>Delete</button>}</article>; })}</div>}
      {tab === "Languages" && <div className="language-manager"><div className="panel-heading"><div><h3>Language versions</h3><p>Track every translation from first draft through final review.</p></div><button onClick={() => update({ versions: [...selected.versions, { id: crypto.randomUUID(), language: "Spanish", status: "Not started" }] })}>＋ Add language</button></div>{selected.versions.map((version) => <article key={version.id}><select value={version.language} onChange={(e) => update({ versions: selected.versions.map((item) => item.id === version.id ? { ...item, language: e.target.value } : item) })}>{LANGUAGES.map((item) => <option key={item}>{item}</option>)}</select><select value={version.status} onChange={(e) => update({ versions: selected.versions.map((item) => item.id === version.id ? { ...item, status: e.target.value } : item) })}>{TRANSLATION_STATUSES.map((item) => <option key={item}>{item}</option>)}</select><progress value={TRANSLATION_STATUSES.indexOf(version.status)} max="3"/><button className="cms-danger" onClick={() => update({ versions: selected.versions.filter((item) => item.id !== version.id) })}>Remove</button></article>)}</div>}
      {tab === "Publishing" && <div className="publishing-manager"><h3>Publishing workflow</h3><p>Choose the next lifecycle stage. Scheduled books require a future publication date.</p><div className="workflow">{BOOK_STATUSES.map((status, index) => <button className={selected.status === status ? "active" : ""} key={status} onClick={() => update({ status })}><i>{index + 1}</i><b>{status}</b><small>{["Private working copy", "Ready for editorial review", "Publish automatically", "Live for readers", "Hidden, safely retained"][index]}</small></button>)}</div>{selected.status === "Scheduled" && <label>Publication date and time<input type="datetime-local" value={selected.scheduledAt} onChange={(e) => update({ scheduledAt: e.target.value })}/>{errors.scheduledAt && <small>{errors.scheduledAt}</small>}</label>}<div className="publish-summary"><b>Release readiness</b><span>{selected.title && selected.author ? "✓ Metadata complete" : "○ Metadata incomplete"}</span><span>{selected.chapters.length ? `✓ ${selected.chapters.length} chapters` : "○ Add chapters"}</span><span>{selected.chapters.every((item) => item.audioStatus === "Ready" && item.audioUrl) ? "✓ Audio complete" : "○ Audio generation pending"}</span></div><div className="publish-actions"><button onClick={publish} disabled={saving}>{saving ? "Publishing…" : "Publish audiobook"}</button>{selected.status === "Published" && <a href="/catalog">View in public catalog →</a>}</div>{Object.values(errors).length > 0 && <div className="publish-errors" role="alert">{Object.values(errors).map((error) => <span key={error}>{error}</span>)}</div>}</div>}
    </main> : books.length === 0 ? <div className="cms-empty"><b>No books yet</b><button onClick={add}>Create your first book</button></div> : null}</div>
  </section>;
}
