import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteStudioBooks, duplicateStudioBook, loadStudioBooks, setStudioBooksStatus } from "../lib/studioBooks.js";

const PAGE_SIZE = 10;
const productionStatuses = new Set(["In Production", "Review", "Scheduled"]);
const displayStatus = (status) => productionStatuses.has(status) ? "In Production" : status || "Draft";
const audioStatus = (chapters) => {
  if (!chapters.length) return "Not started";
  const ready = chapters.filter((chapter) => chapter.audioStatus === "Ready").length;
  return ready === chapters.length ? "Complete" : ready ? `${ready}/${chapters.length} ready` : "Not started";
};
const dateValue = (book, key) => book[key] || book[key === "updated_at" ? "updatedAt" : "createdAt"] || "";

export default function StudioBooks() {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("updated_at");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true); setError("");
    try { setBooks(await loadStudioBooks()); }
    catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => { setPage(1); }, [query, filter, sort]);

  const filtered = useMemo(() => books
    .filter((book) => filter === "All" || displayStatus(book.status) === filter)
    .filter((book) => `${book.title || ""} ${book.author || ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === "title"
      ? (a.title || "").localeCompare(b.title || "")
      : new Date(dateValue(b, sort) || 0) - new Date(dateValue(a, sort) || 0)), [books, filter, query, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allShownSelected = shown.length > 0 && shown.every((book) => selected.includes(book.id));

  const run = async (operation) => {
    setError("");
    try { await operation(); setSelected([]); await refresh(); }
    catch (cause) { setError(cause.message); }
  };
  const remove = (ids) => {
    if (ids.length && window.confirm(`Delete ${ids.length} selected book${ids.length === 1 ? "" : "s"}?`)) run(() => deleteStudioBooks(ids));
  };
  const publish = (ids) => ids.length && run(() => setStudioBooksStatus(ids, "Published"));
  const exportSelected = () => {
    const payload = books.filter((book) => selected.includes(book.id));
    if (!payload.length) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "novelverse-books.json"; link.click(); URL.revokeObjectURL(url);
  };
  const go = (section, id) => navigate(`/admin/studio/${section}?book=${encodeURIComponent(id)}`);

  return <section className="studio-books">
    <header><div><h2>Books</h2><p>Manage every book in NovelVerse Studio.</p></div><button onClick={() => navigate("/admin/studio/import-book")}>Import Book</button></header>
    <div className="studio-books__controls">
      <label className="studio-books__search"><span className="sr-only">Search books</span><input type="search" placeholder="Search title or author…" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
      <label>Filter<select aria-label="Filter by status" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All</option><option>Draft</option><option>In Production</option><option>Published</option></select></label>
      <label>Sort<select aria-label="Sort books" value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated_at">Updated</option><option value="created_at">Created</option><option value="title">Title</option></select></label>
    </div>
    {selected.length > 0 && <div className="studio-books__bulk"><strong>{selected.length} selected</strong><button onClick={() => remove(selected)}>Delete Selected</button><button onClick={() => publish(selected)}>Publish Selected</button><button onClick={exportSelected}>Export Selected</button></div>}
    {error && <div className="studio-books__message error" role="alert">{error}</div>}
    {loading ? <div className="studio-books__message">Loading books…</div> : filtered.length === 0 ? <div className="studio-books__message">No books found.</div> : <div className="studio-books__table-wrap"><table><thead><tr><th><input aria-label="Select all books on page" type="checkbox" checked={allShownSelected} onChange={() => setSelected((ids) => allShownSelected ? ids.filter((id) => !shown.some((book) => book.id === id)) : [...new Set([...ids, ...shown.map((book) => book.id)])])}/></th><th>Book</th><th>Chapters</th><th>Status</th><th>Audio</th><th>Last updated</th><th>Actions</th></tr></thead><tbody>{shown.map((book) => <tr key={book.id}><td><input aria-label={`Select ${book.title}`} type="checkbox" checked={selected.includes(book.id)} onChange={() => setSelected((ids) => ids.includes(book.id) ? ids.filter((id) => id !== book.id) : [...ids, book.id])}/></td><td><div className="studio-books__identity">{book.coverUrl ? <img src={book.coverUrl} alt=""/> : <span aria-hidden="true">{(book.title || "?").slice(0, 1)}</span>}<div><strong>{book.title}</strong><small>{book.author || "—"}</small></div></div></td><td>{book.chapters.length}</td><td><span className={`studio-books__status ${displayStatus(book.status).toLowerCase().replaceAll(" ", "-")}`}>{displayStatus(book.status)}</span></td><td>{audioStatus(book.chapters)}</td><td>{dateValue(book, "updated_at") ? new Date(dateValue(book, "updated_at")).toLocaleDateString() : "—"}</td><td><details><summary>Actions</summary><div><button onClick={() => navigate(`/admin/studio/books/${book.id}`)}>Open Book</button><button onClick={() => go("import-book", book.id)}>Open Import</button><button onClick={() => go("voice-director", book.id)}>Open Voice Director</button><button onClick={() => go("audio-production", book.id)}>Open Audio Production</button><button onClick={() => publish([book.id])}>Publish</button><button onClick={() => run(() => duplicateStudioBook(book))}>Duplicate</button><button className="danger" onClick={() => remove([book.id])}>Delete</button></div></details></td></tr>)}</tbody></table></div>}
    {!loading && filtered.length > 0 && <footer><span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span><div><button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page === pages} onClick={() => setPage((value) => value + 1)}>Next</button></div></footer>}
  </section>;
}
