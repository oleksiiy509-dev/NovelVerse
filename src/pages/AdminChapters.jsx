import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { splitIntoChapters } from "../lib/admin";
import { callChapterAudioGeneration, formatFileSize } from "../lib/chapterAudio";
import { adminWrite, parseChapterImport, safeWrite } from "../lib/adminContent";
import "../styles/AdminPanel.css";

function readFile(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(reader.error); reader.readAsText(file); }); }
function textLen(value = "") { return String(value).replace(/<[^>]+>/g, " ").trim().length; }
function copyChapterPayload(chapter) { const copy = { ...chapter }; delete copy.id; delete copy.created_at; return copy; }

function AdminChapters() {
  const navigate = useNavigate();
  const [chapters, setChapters] = useState([]);
  const [novels, setNovels] = useState([]);
  const [query, setQuery] = useState("");
  const [novel, setNovel] = useState("all");
  const [selected, setSelected] = useState([]);
  const [sort, setSort] = useState("number-asc");
  const [preview, setPreview] = useState([]);
  const [progress, setProgress] = useState("");
  const [toast, setToast] = useState("");
  const [audioRows, setAudioRows] = useState({});

  useEffect(() => { load(); }, []);
  async function load() {
    const [{ data: novelRows }, { data, error }] = await Promise.all([
      supabase.from("novels").select("id,title").order("title"),
      supabase.from("chapters").select("*").order("novel_id").order("number"),
    ]);
    setNovels(novelRows || []);
    if (error) setToast(error.message); else setChapters(data || []);
    const ids = (data || []).map((item) => item.id);
    if (ids.length) {
      const { data: audioData } = await supabase.from("chapter_audio").select("*").in("chapter_id", ids).order("updated_at", { ascending: false });
      setAudioRows((audioData || []).reduce((map, item) => ({ ...map, [item.chapter_id]: map[item.chapter_id] || item }), {}));
    } else setAudioRows({});
  }
  const novelTitle = useCallback((id) => novels.find((item) => String(item.id) === String(id))?.title || `Novel ${id}`, [novels]);

  async function del(id, title) { if (!window.confirm(`Delete chapter “${title}”?`)) return; try { await adminWrite(() => supabase.from("chapters").delete().eq("id", id)); setToast("Chapter deleted."); load(); } catch (error) { setToast(error.message); } }
  async function bulkDelete() { if (!selected.length || !window.confirm(`Permanently delete ${selected.length} chapters?`)) return; try { await adminWrite(() => supabase.from("chapters").delete().in("id", selected)); setSelected([]); setToast("Selected chapters deleted."); load(); } catch (error) { setToast(error.message); } }
  async function duplicateChapter(chapter) { const copy = copyChapterPayload(chapter); const numbers = chapters.filter((item) => item.novel_id === chapter.novel_id).map((item) => Number(item.number)); const nextNumber = Math.max(0, ...numbers) + 1; try { await safeWrite("chapters", { ...copy, number: nextNumber, title: `${chapter.title} Copy`, status: "Draft" }, (queryBuilder, payload) => queryBuilder.insert(payload), ["novel_id", "number", "title", "content"]); setToast("Chapter duplicated as draft."); load(); } catch (error) { setToast(error.message); } }
  async function setPublishStatus(chapter, status) { try { const result = await safeWrite("chapters", { status }, (queryBuilder, payload) => queryBuilder.update(payload).eq("id", chapter.id)); setToast(result.skipped ? "Chapter status is not supported by this database schema." : (status === "Published" ? "Chapter published." : "Chapter unpublished.")); load(); } catch (error) { setToast(error.message); } }
  async function chooseFiles(files) { if (novel === "all") { setToast("Choose one novel before import."); return; } const existing = new Set(chapters.filter((chapter) => String(chapter.novel_id) === novel).map((chapter) => Number(chapter.number))); const rows = []; for (const file of files) { const raw = await readFile(file); rows.push(...parseChapterImport(file.name, raw, splitIntoChapters)); } setPreview(rows.map((row, index) => ({ ...row, number: Number(row.number || index + 1), duplicate: existing.has(Number(row.number || index + 1)) })).filter((row) => row.content)); }
  async function importPreview() { const rows = preview.filter((row) => !row.duplicate).map((row) => ({ novel_id: Number(novel), number: Number(row.number), title: row.title, content: row.content, status: "Published" })); if (!rows.length) { setToast("No new chapters to import."); return; } let success = 0; for (let index = 0; index < rows.length; index += 5) { const batch = rows.slice(index, index + 5); await safeWrite("chapters", batch, (queryBuilder, payload) => queryBuilder.insert(payload), ["novel_id", "number", "title", "content"]); success += batch.length; setProgress(`${success}/${rows.length} imported`); } setPreview([]); load(); }
  async function generateAudio(chapter) {
    try {
      const result = await callChapterAudioGeneration(chapter.id, "auto", "default");
      setToast(result?.code === "provider_not_configured" ? "AI Audio provider is not configured yet. No audio was generated." : "Audio generation request finished.");
      load();
    } catch (error) {
      setToast(error.message?.includes("501") ? "AI Audio provider is not configured yet. No audio was generated." : (error.message || "Audio generation failed."));
    }
  }
  async function deleteAudio(chapter) {
    const audio = audioRows[chapter.id];
    if (!audio || !window.confirm(`Delete AI audio metadata for “${chapter.title}”? Storage files are not automatically removed.`)) return;
    try { await adminWrite(() => supabase.from("chapter_audio").delete().eq("id", audio.id)); setToast("AI audio metadata deleted. Existing storage objects were not automatically deleted."); load(); } catch (error) { setToast(error.message); }
  }

  async function renumber(id, number) { const chapter = chapters.find((item) => item.id === id); const duplicate = chapters.some((item) => item.id !== id && item.novel_id === chapter.novel_id && Number(item.number) === Number(number)); if (duplicate) { setToast("Duplicate chapter number detected. Choose a free number first."); return; } try { await adminWrite(() => supabase.from("chapters").update({ number: Number(number) }).eq("id", id)); setToast("Chapter number updated safely."); load(); } catch (error) { setToast(error.message); } }

  const filtered = useMemo(() => chapters.filter((chapter) => (novel === "all" || String(chapter.novel_id) === novel) && (!query || [chapter.number, chapter.title, novelTitle(chapter.novel_id)].some((value) => String(value || "").toLowerCase().includes(query.toLowerCase())))).sort((a, b) => (sort === "number-desc" ? Number(b.number) - Number(a.number) : Number(a.number) - Number(b.number))), [chapters, query, novel, sort, novelTitle]);
  return <main className="admin-shell"><div className="admin-header"><div><h1>📖 Chapter Manager</h1><p className="admin-muted">Search, duplicate detection, draft publishing and protected deletes.</p></div><div className="admin-actions"><button onClick={() => navigate("/admin/chapters/add")}>➕ Add</button><button className="admin-secondary" onClick={() => navigate("/admin")}>Back</button></div></div>{toast && <p className="admin-toast">{toast}</p>}<section className="admin-card admin-filters"><input placeholder="Search number, title or novel" value={query} onChange={(e) => setQuery(e.target.value)} /><select value={novel} onChange={(e) => setNovel(e.target.value)}><option value="all">All novels</option>{novels.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="number-asc">Chapter number ↑</option><option value="number-desc">Chapter number ↓</option></select><label className="admin-import-button">Import TXT/JSON/CSV<input type="file" multiple accept=".txt,.json,.csv,text/plain,application/json,text/csv" onChange={(e) => chooseFiles([...e.target.files])} /></label><button className="admin-danger" disabled={!selected.length} onClick={bulkDelete}>Bulk delete ({selected.length})</button></section>{preview.length > 0 && <section className="admin-card admin-preview-list"><h2>Import preview</h2>{preview.map((row, index) => <div className="admin-import-row" key={`${row.title}-${index}`}><input type="number" value={row.number} onChange={(e) => setPreview((rows) => rows.map((item, idx) => (idx === index ? { ...item, number: e.target.value } : item)))} /><input value={row.title} onChange={(e) => setPreview((rows) => rows.map((item, idx) => (idx === index ? { ...item, title: e.target.value } : item)))} /><span>{textLen(row.content)} chars {row.duplicate ? "• duplicate skipped" : ""}</span></div>)}<button onClick={importPreview}>Import in batches</button><span className="admin-muted">{progress}</span></section>}<section className="admin-table-wrap"><table className="admin-table"><thead><tr><th></th><th>Novel</th><th>No.</th><th>Title</th><th>Status</th><th>Length</th><th>AI Audio</th><th>Actions</th></tr></thead><tbody>{filtered.map((chapter) => <tr key={chapter.id}><td><input type="checkbox" checked={selected.includes(chapter.id)} onChange={(e) => setSelected((ids) => (e.target.checked ? [...ids, chapter.id] : ids.filter((id) => id !== chapter.id)))} /></td><td>{novelTitle(chapter.novel_id)}</td><td><input className="admin-number" type="number" defaultValue={chapter.number} onBlur={(e) => Number(e.target.value) !== Number(chapter.number) && renumber(chapter.id, e.target.value)} /></td><td>{chapter.title}</td><td>{chapter.status || "Published"}</td><td>{textLen(chapter.content)}</td><td>{(() => { const audio = audioRows[chapter.id]; return <div className="admin-audio-cell"><strong>{audio?.status || "unavailable"}</strong><span>{audio?.language || "auto"} · {audio?.voice_id || "default"}</span><span>{audio?.provider || "—"}</span><span>{audio?.duration_seconds ? `${Math.round(audio.duration_seconds)}s` : "—"} · {formatFileSize(audio?.file_size)}</span><span>{audio?.created_at ? new Date(audio.created_at).toLocaleDateString() : "Not generated"}</span><button type="button" onClick={() => generateAudio(chapter)}>{audio ? "Regenerate" : "Generate"}</button><button type="button" className="admin-danger" disabled={!audio} onClick={() => deleteAudio(chapter)}>Delete audio</button></div>; })()}</td><td><button onClick={() => navigate(`/reader/${chapter.id}`)}>Preview</button><button onClick={() => navigate(`/admin/chapters/edit/${chapter.id}`)}>Edit</button><button onClick={() => duplicateChapter(chapter)}>Duplicate</button><button onClick={() => setPublishStatus(chapter, chapter.status === "Draft" ? "Published" : "Draft")}>{chapter.status === "Draft" ? "Publish" : "Unpublish"}</button><button className="admin-danger" onClick={() => del(chapter.id, chapter.title)}>Delete</button></td></tr>)}</tbody></table>{!filtered.length && <p className="empty-state">No chapters found.</p>}</section></main>;
}
export default AdminChapters;
