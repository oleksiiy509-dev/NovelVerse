import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { buildNovelMetadata, slugify } from "../lib/admin";

const emptyNovel = { title:"", author:"", slug:"", description:"", meta_title:"", meta_description:"", keywords:"", rating:"", chapters:"", image:"", genres:"", tags:"", status:"Ongoing", views:0, bookmarks:0 };
const withoutCategory = (value = {}) => { const fields = { ...value }; delete fields.category; return fields; };

function NovelForm({ initialNovel, novelId }) {
  const navigate = useNavigate();
  const draftKey = `novelverse:novel-draft:${novelId || "new"}`;
  const [form, setForm] = useState(() => { const saved = JSON.parse(localStorage.getItem(draftKey) || "{}"); const initialData = withoutCategory(initialNovel); const savedData = withoutCategory(saved); const genres = [initialData.genres, saved.category, savedData.genres].filter(Boolean).join(", "); return { ...emptyNovel, ...initialData, ...savedData, genres }; });
  const [coverFile, setCoverFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const metadata = useMemo(() => buildNovelMetadata(form), [form]);

  useEffect(() => { const id = setTimeout(() => localStorage.setItem(draftKey, JSON.stringify(form)), 700); return () => clearTimeout(id); }, [draftKey, form]);
  function field(name, value){ setForm((f)=>({ ...f, [name]: value })); }
  function generateMetadata(){ setForm((f)=>({ ...f, ...buildNovelMetadata(f) })); }
  function pickCover(file){ if (!file) return; setCoverFile(file); field("image", URL.createObjectURL(file)); }
  async function uploadCover(){ if (!coverFile) return form.image; const path = `${Date.now()}-${slugify(coverFile.name)}`; const { error } = await supabase.storage.from("covers").upload(path, coverFile); if (error) throw error; return supabase.storage.from("covers").getPublicUrl(path).data.publicUrl; }
  async function save(e){ e.preventDefault(); setSaving(true); try { const image = await uploadCover(); const novelFields = withoutCategory(form); const payload = { ...novelFields, ...buildNovelMetadata(novelFields), image, rating:Number(form.rating)||0, chapters:Number(form.chapters)||0, views:Number(form.views)||0, bookmarks:Number(form.bookmarks)||0 }; const result = novelId ? await supabase.from("novels").update(payload).eq("id", novelId) : await supabase.from("novels").insert(payload); if (result.error) throw result.error; localStorage.removeItem(draftKey); navigate("/admin/novels"); } catch (error) { alert(error.message); } finally { setSaving(false); } }

  return <form className="admin-form" onSubmit={save}>
    <div className="admin-form-grid">
      <label>Назва<input required value={form.title} onChange={(e)=>field("title", e.target.value)} onBlur={()=>!form.slug && field("slug", metadata.slug)} /></label>
      <label>Автор<input required value={form.author} onChange={(e)=>field("author", e.target.value)} /></label>
      <label>Slug<input value={form.slug || ""} placeholder={metadata.slug} onChange={(e)=>field("slug", slugify(e.target.value))} /></label>
      <label>Статус<select value={form.status || "Ongoing"} onChange={(e)=>field("status", e.target.value)}><option>Ongoing</option><option>Completed</option><option>Hiatus</option></select></label>
      <label className="admin-full">Опис<textarea rows={6} required value={form.description} placeholder={metadata.description} onChange={(e)=>field("description", e.target.value)} /></label>
      <label>Категорії та жанри<input value={form.genres || ""} onChange={(e)=>field("genres", e.target.value)} placeholder="Fantasy, Action, Adventure" /></label>
      <label className="admin-full">Теги<input value={form.tags || ""} onChange={(e)=>field("tags", e.target.value)} placeholder="magic, academy" /></label>
      <label>Meta title<input value={form.meta_title || ""} placeholder={metadata.meta_title} onChange={(e)=>field("meta_title", e.target.value)} /></label>
      <label>Meta description<input value={form.meta_description || ""} placeholder={metadata.meta_description} onChange={(e)=>field("meta_description", e.target.value)} /></label>
      <label className="admin-full">Keywords<input value={form.keywords || ""} placeholder={metadata.keywords} onChange={(e)=>field("keywords", e.target.value)} /></label>
      <label>Рейтинг<input type="number" step="0.1" value={form.rating} onChange={(e)=>field("rating", e.target.value)} /></label>
      <label>Кількість глав<input type="number" value={form.chapters} onChange={(e)=>field("chapters", e.target.value)} /></label>
      <label>Перегляди<input type="number" value={form.views} onChange={(e)=>field("views", e.target.value)} /></label>
      <label>Закладки<input type="number" value={form.bookmarks} onChange={(e)=>field("bookmarks", e.target.value)} /></label>
      <label className={`admin-full admin-dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(e)=>{e.preventDefault(); setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={(e)=>{e.preventDefault(); setDragging(false); pickCover(e.dataTransfer.files?.[0]);}}>Обкладинка Supabase Storage<span>Перетягніть зображення сюди або виберіть файл</span><input type="file" accept="image/*" onChange={(e)=>pickCover(e.target.files?.[0])} /></label>
    </div>
    {form.image && <img className="admin-cover-preview" src={form.image} alt="Поточна обкладинка" />}
    {preview && <section className="admin-preview"><h2>{form.title || "Untitled"}</h2><p className="admin-muted">{form.author} • {form.genres} • {form.status}</p><p>{form.description || metadata.description}</p><div className="admin-chip-list">{(form.tags || metadata.keywords).split(",").filter(Boolean).map((t)=><span className="admin-chip" key={t}>{t.trim()}</span>)}</div></section>}
    <div className="admin-actions"><button type="button" className="admin-secondary" onClick={generateMetadata}>✨ Згенерувати метадані</button><button type="button" className="admin-secondary" onClick={()=>setPreview((v)=>!v)}>👁️ Preview</button><button disabled={saving}>{saving ? "Збереження..." : "💾 Зберегти"}</button><button type="button" className="admin-secondary" onClick={()=>navigate("/admin/novels")}>Скасувати</button></div>
    <p className="admin-muted">Чернетка автозберігається у цьому браузері.</p>
  </form>;
}
export default NovelForm;
