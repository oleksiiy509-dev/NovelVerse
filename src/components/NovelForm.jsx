import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { buildNovelMetadata, slugify } from "../lib/admin";
import { adminError, adminWrite, duplicateSlugExists, makeSlug } from "../lib/adminContent";

const emptyNovel = { title:"", author:"", slug:"", image:"", description:"", status:"Ongoing", genres:"", tags:"", rating:"", keywords:"", meta_title:"", meta_description:"", views:0, bookmarks:0, chapters:0 };
const allowedNovelFields = Object.keys(emptyNovel);
const toNovelFields = (value = {}) => allowedNovelFields.reduce((fields, key) => ({ ...fields, [key]: value[key] ?? emptyNovel[key] }), {});
const MAX_COVER_MB = 5;

async function compressImage(file) {
  if (file.size < 900_000) return file;
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  return new File([blob], `${slugify(file.name)}.jpg`, { type: "image/jpeg" });
}

function NovelForm({ initialNovel, novelId }) {
  const navigate = useNavigate();
  const draftKey = `novelverse:novel-draft:${novelId || "new"}`;
  const [form, setForm] = useState(() => ({ ...emptyNovel, ...toNovelFields(initialNovel), ...(JSON.parse(localStorage.getItem(draftKey) || "{}")) }));
  const [coverFile, setCoverFile] = useState(null); const [dragging, setDragging] = useState(false); const [saving, setSaving] = useState(false); const [preview, setPreview] = useState(false); const [notice, setNotice] = useState("");
  const metadata = useMemo(() => buildNovelMetadata(form), [form]);
  useEffect(() => { const id = setTimeout(() => localStorage.setItem(draftKey, JSON.stringify(toNovelFields(form))), 700); return () => clearTimeout(id); }, [draftKey, form]);
  function field(name, value){ setForm((f)=>({ ...f, [name]: value, ...(name === "title" && !f.slug ? { slug: makeSlug(value) } : {}) })); }
  async function pickCover(file){ if (!file) return; if (!file.type.startsWith("image/")) { setNotice("Only image covers are allowed."); return; } if (file.size > MAX_COVER_MB * 1024 * 1024) { setNotice(`Cover must be under ${MAX_COVER_MB}MB before compression.`); return; } const compressed = await compressImage(file); setCoverFile(compressed); field("image", URL.createObjectURL(compressed)); setNotice("Cover preview ready. It will upload on save."); }
  async function uploadCover(){ if (!coverFile) return form.image; const path = `${Date.now()}-${slugify(coverFile.name)}`; const { error } = await supabase.storage.from("covers").upload(path, coverFile, { contentType: coverFile.type, upsert:false }); if (error) throw new Error(adminError(error, "Cover upload failed.")); return supabase.storage.from("covers").getPublicUrl(path).data.publicUrl; }
  async function save(e, forcedStatus){ e.preventDefault(); setSaving(true); setNotice(""); try { const slug = makeSlug(form.title, form.slug); if (!form.title || !form.author || !form.description) throw new Error("Title, author and description are required."); if (await duplicateSlugExists(slug, novelId)) throw new Error(`Slug “${slug}” already exists. Choose another slug.`); const image = await uploadCover(); const payload = { ...toNovelFields(form), slug, status: forcedStatus || form.status, image, ...buildNovelMetadata(form), rating:Number(form.rating)||0, chapters:Number(form.chapters)||0, views:Number(form.views)||0, bookmarks:Number(form.bookmarks)||0, meta_title: form.meta_title || form.title, meta_description: form.meta_description || form.description, keywords: form.keywords || form.tags || form.genres }; await adminWrite(() => novelId ? supabase.from("novels").update(payload).eq("id", novelId) : supabase.from("novels").insert(payload)); localStorage.removeItem(draftKey); navigate("/admin/novels"); } catch (error) { setNotice(error.message); } finally { setSaving(false); } }
  return <form className="admin-form" onSubmit={save}>
    {notice && <p className="admin-toast">{notice}</p>}<div className="admin-form-grid">
      <label>Title<input required value={form.title} onChange={(e)=>field("title", e.target.value)} /></label><label>Author<input required value={form.author} onChange={(e)=>field("author", e.target.value)} /></label><label>Slug<input required value={form.slug} onChange={(e)=>field("slug", slugify(e.target.value))} /></label><label>Status<select value={form.status || "Ongoing"} onChange={(e)=>field("status", e.target.value)}><option>Draft</option><option>Ongoing</option><option>Completed</option><option>Hiatus</option></select></label>
      <label className="admin-full">Description<textarea rows={6} required value={form.description} placeholder={metadata.description} onChange={(e)=>field("description", e.target.value)} /></label><label>Genres<input value={form.genres || ""} onChange={(e)=>field("genres", e.target.value)} placeholder="Fantasy, Action" /></label><label>Tags<input value={form.tags || ""} onChange={(e)=>field("tags", e.target.value)} /></label><label>Rating<input type="number" step="0.1" value={form.rating} onChange={(e)=>field("rating", e.target.value)} /></label><label>Keywords<input value={form.keywords || ""} onChange={(e)=>field("keywords", e.target.value)} /></label><label>Meta title<input value={form.meta_title || ""} onChange={(e)=>field("meta_title", e.target.value)} /></label><label className="admin-full">Meta description<textarea rows={3} value={form.meta_description || ""} onChange={(e)=>field("meta_description", e.target.value)} /></label>
      <label className={`admin-full admin-dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(e)=>{e.preventDefault(); setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={(e)=>{e.preventDefault(); setDragging(false); pickCover(e.dataTransfer.files?.[0]);}}>Cover upload<span>Preview, validate, compress, then upload to Supabase covers bucket.</span><input type="file" accept="image/*" onChange={(e)=>pickCover(e.target.files?.[0])} /></label></div>
    <div className="admin-actions">{form.image && <img className="admin-cover-preview" src={form.image} alt="Cover preview" />}<button type="button" className="admin-secondary" onClick={()=>field("image", "")}>Remove cover</button></div>
    {preview && <section className="admin-preview"><h2>{form.title || "Untitled"}</h2><p className="admin-muted">{form.author} • {form.genres} • {form.status}</p><p>{form.description || metadata.description}</p></section>}
    <div className="admin-actions"><button type="button" className="admin-secondary" onClick={()=>setPreview((v)=>!v)}>👁️ Preview</button><button type="button" className="admin-secondary" disabled={saving} onClick={(e)=>save(e, "Draft")}>Save draft</button><button disabled={saving}>{saving ? "Saving..." : "💾 Save"}</button><button type="button" className="admin-secondary" onClick={()=>navigate("/admin/novels")}>Cancel</button></div><p className="admin-muted">Draft autosaves only form text in this browser; admin secrets are never stored.</p></form>;
}
export default NovelForm;
