import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { markdownToText, splitIntoChapters, stripMarkup } from "../lib/admin";
import { duplicateChapterNumberExists, safeWrite } from "../lib/adminContent";
import { htmlToPlainText, sanitizeRichText } from "../lib/richText";
import RichTextEditor from "./RichTextEditor";

const empty = { novel_id: "", title: "", number: "", content: "", status: "Published" };
function readFile(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(reader.error); reader.readAsText(file); }); }

function ChapterForm({ initialChapter, chapterId }) {
  const navigate = useNavigate();
  const draftKey = `novelverse:chapter-draft:${chapterId || "new"}`;
  const [form, setForm] = useState(() => ({ ...empty, ...(initialChapter || {}), ...(JSON.parse(localStorage.getItem(draftKey) || "{}")) }));
  const [novels, setNovels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [importNote, setImportNote] = useState("");

  useEffect(() => { supabase.from("novels").select("id,title").order("title").then(({ data }) => setNovels(data || [])); }, []);
  useEffect(() => { const id = setTimeout(() => localStorage.setItem(draftKey, JSON.stringify(form)), 700); return () => clearTimeout(id); }, [draftKey, form]);
  function field(name, value) { setForm((current) => ({ ...current, [name]: value })); }

  async function importDocument(file) {
    if (!file) return;
    const raw = await readFile(file);
    const name = file.name.toLowerCase();
    const text = name.endsWith(".md") || name.endsWith(".markdown") ? markdownToText(raw) : name.endsWith(".epub") ? stripMarkup(raw) : name.endsWith(".pdf") ? raw.replace(/[^\n\r\t -~а-яіїєґё]+/giu, " ") : raw;
    const chapters = splitIntoChapters(text, file.name.replace(/\.[^.]+$/, ""));
    const first = chapters[0] || { title: file.name, content: text };
    setForm((current) => ({ ...current, title: current.title || first.title, content: first.content || text }));
    setImportNote(`${file.name}: imported ${chapters.length || 1} chapter(s). Use the chapter list page for batch imports.`);
  }

  async function save(event, forcedStatus) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setNotice("");
    try {
      const plainContent = htmlToPlainText(form.content);
      if (!form.novel_id || !form.number || !form.title.trim()) throw new Error("Novel, chapter number and title are required.");
      if (!plainContent) throw new Error("Chapter content cannot be empty.");
      if (await duplicateChapterNumberExists(form.novel_id, form.number, chapterId)) throw new Error("Duplicate chapter number detected for this novel.");
      const payload = { novel_id: Number(form.novel_id), title: form.title.trim(), number: Number(form.number), content: sanitizeRichText(form.content), status: forcedStatus || form.status };
      await safeWrite("chapters", payload, (query, next) => (chapterId ? query.update(next).eq("id", chapterId) : query.insert(next)), ["novel_id", "number", "title", "content"]);
      localStorage.removeItem(draftKey);
      navigate("/admin/chapters");
    } catch (error) { setNotice(error.message); }
    finally { setSaving(false); }
  }

  return <form className="admin-form" onSubmit={save}>
    {notice && <p className="admin-toast">{notice}</p>}
    <div className="admin-form-grid">
      <label>Novel<select required value={form.novel_id} onChange={(e) => field("novel_id", e.target.value)}><option value="">Choose novel</option>{novels.map((novel) => <option key={novel.id} value={novel.id}>{novel.title}</option>)}</select></label>
      <label>Chapter number<input type="number" min="1" required value={form.number} onChange={(e) => field("number", e.target.value)} /></label>
      <label>Status<select value={form.status || "Published"} onChange={(e) => field("status", e.target.value)}><option>Published</option><option>Draft</option></select></label>
      <label className="admin-full">Chapter title<input required value={form.title} onChange={(e) => field("title", e.target.value)} /></label>
      <label className="admin-full admin-dropzone">Import Markdown, TXT, EPUB or PDF<span>Choose a file to fill the editor. Batch import is on the chapter list page.</span><input type="file" accept=".md,.markdown,.txt,.epub,.pdf,text/plain,text/markdown,application/epub+zip,application/pdf" onChange={(e) => importDocument(e.target.files?.[0])} /></label>
      {importNote && <p className="admin-full admin-muted">{importNote}</p>}
      <label className="admin-full">Chapter content<RichTextEditor value={form.content} onChange={(value) => field("content", value)} /></label>
    </div>
    <div className="admin-actions"><button type="button" className="admin-secondary" disabled={saving} onClick={(e) => save(e, "Draft")}>Save draft</button><button disabled={saving}>{saving ? "Saving..." : "💾 Save"}</button><button type="button" className="admin-secondary" onClick={() => navigate("/admin/chapters")}>Cancel</button></div>
    <p className="admin-muted">Publication status is skipped automatically if the chapters table does not support it.</p>
  </form>;
}
export default ChapterForm;
