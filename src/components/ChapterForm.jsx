import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { markdownToText, splitIntoChapters, stripMarkup } from "../lib/admin";
import { adminWrite } from "../lib/adminContent";
import RichTextEditor from "./RichTextEditor";

const empty = { novel_id:"", title:"", number:"", content:"" };
function htmlToText(html="") { return html.replace(/<br\s*\/?>/gi,"\n").replace(/<\/p>/gi,"\n\n").replace(/<[^>]+>/g,"").trim(); }
function readFile(file){ return new Promise((resolve,reject)=>{ const reader = new FileReader(); reader.onload=()=>resolve(String(reader.result || "")); reader.onerror=()=>reject(reader.error); reader.readAsText(file); }); }

function ChapterForm({ initialChapter, chapterId }) {
  const navigate=useNavigate();
  const draftKey = `novelverse:chapter-draft:${chapterId || "new"}`;
  const [form,setForm]=useState(()=>({...empty,...(initialChapter||{}), ...(JSON.parse(localStorage.getItem(draftKey) || "{}"))}));
  const [novels,setNovels]=useState([]);
  const [saving,setSaving]=useState(false);
  const [importNote,setImportNote]=useState("");
  useEffect(()=>{ supabase.from("novels").select("id,title").order("title").then(({data})=>setNovels(data||[])); },[]);
  useEffect(()=>{ const id=setTimeout(()=>localStorage.setItem(draftKey, JSON.stringify(form)), 700); return ()=>clearTimeout(id); }, [draftKey, form]);
  function field(n,v){setForm(f=>({...f,[n]:v}))}
  async function importDocument(file){
    if(!file) return;
    const raw = await readFile(file);
    const name = file.name.toLowerCase();
    const text = name.endsWith(".md") || name.endsWith(".markdown") ? markdownToText(raw) : name.endsWith(".epub") ? stripMarkup(raw) : name.endsWith(".pdf") ? raw.replace(/[^\n\r\t -~а-яіїєґё]+/giu, " ") : raw;
    const chapters = splitIntoChapters(text, file.name.replace(/\.[^.]+$/, ""));
    const first = chapters[0] || { title:file.name, content:text };
    setForm((f)=>({ ...f, title:f.title || first.title, content:first.content || text }));
    setImportNote(`${file.name}: імпортовано ${chapters.length || 1} розділ(и). Для масового імпорту використайте сторінку списку глав.`);
  }
  async function save(e){ e.preventDefault(); setSaving(true); const duplicate = await supabase.from("chapters").select("id").eq("novel_id", Number(form.novel_id)).eq("number", Number(form.number)).neq("id", chapterId || 0).limit(1); if(duplicate.data?.length){ setSaving(false); alert("Duplicate chapter number detected for this novel."); return; } const payload={ novel_id:Number(form.novel_id), title:form.title, number:Number(form.number), content: htmlToText(form.content) }; try { await adminWrite(() => chapterId ? supabase.from("chapters").update(payload).eq("id", chapterId) : supabase.from("chapters").insert(payload)); localStorage.removeItem(draftKey); navigate("/admin/chapters"); } catch(error) { alert(error.message); } finally { setSaving(false); } }
return <form className="admin-form" onSubmit={save}><div className="admin-form-grid"><label>Новела<select required value={form.novel_id} onChange={(e)=>field("novel_id", e.target.value)}><option value="">Оберіть новелу</option>{novels.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></label><label>Номер глави<input type="number" required value={form.number} onChange={(e)=>field("number", e.target.value)} /></label><label className="admin-full">Назва глави<input required value={form.title} onChange={(e)=>field("title", e.target.value)} /></label><label className="admin-full admin-dropzone">Імпорт Markdown, TXT, EPUB або PDF<span>Виберіть файл, щоб заповнити редактор. EPUB автоматично шукає заголовки глав.</span><input type="file" accept=".md,.markdown,.txt,.epub,.pdf,text/plain,text/markdown,application/epub+zip,application/pdf" onChange={(e)=>importDocument(e.target.files?.[0])} /></label>{importNote && <p className="admin-full admin-muted">{importNote}</p>}<label className="admin-full">Вміст глави<RichTextEditor value={form.content} onChange={(value)=>field("content", value)} /></label></div><div className="admin-actions"><button disabled={saving}>{saving?"Збереження...":"💾 Зберегти"}</button><button type="button" className="admin-secondary" onClick={()=>navigate("/admin/chapters")}>Скасувати</button></div><p className="admin-muted">Чернетка глави автозберігається у цьому браузері.</p></form> }
export default ChapterForm;
