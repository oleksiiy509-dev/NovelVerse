import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { buildNovelMetadata, slugify } from "../lib/admin";
import { adminError, duplicateSlugExists, makeSlug, safeWrite, STATUS_OPTIONS } from "../lib/adminContent";

const emptyNovel = {
  title: "", author: "", slug: "", image: "", description: "", status: "Ongoing", genres: "", rating: "",
  views: 0, bookmarks: 0, chapters: 0, alternative_titles: "", language: "", tags: "", keywords: "",
  meta_title: "", meta_description: "",
};
const allowedNovelFields = Object.keys(emptyNovel);
const toNovelFields = (value = {}) => allowedNovelFields.reduce((fields, key) => ({ ...fields, [key]: value[key] ?? emptyNovel[key] }), {});
const MAX_COVER_MB = 5;

async function compressImage(file) {
  if (file.size < 900_000 || !window.createImageBitmap) return file;
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
  const [coverFile, setCoverFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState("");
  const metadata = useMemo(() => buildNovelMetadata(form), [form]);

  useEffect(() => {
    const id = setTimeout(() => localStorage.setItem(draftKey, JSON.stringify(toNovelFields(form))), 700);
    return () => clearTimeout(id);
  }, [draftKey, form]);

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value, ...(name === "title" && !current.slug ? { slug: makeSlug(value) } : {}) }));
  }

  async function pickCover(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setNotice("Only image files can be used as covers."); return; }
    if (file.size > MAX_COVER_MB * 1024 * 1024) { setNotice(`Cover must be ${MAX_COVER_MB}MB or smaller.`); return; }
    const compressed = await compressImage(file);
    setCoverFile(compressed);
    field("image", URL.createObjectURL(compressed));
    setNotice("Cover preview ready. It will upload when you save.");
  }

  async function uploadCover() {
    if (!coverFile) return form.image;
    setUploading(true);
    const path = `${Date.now()}-${slugify(coverFile.name)}`;
    const { error } = await supabase.storage.from("covers").upload(path, coverFile, { contentType: coverFile.type, upsert: false });
    setUploading(false);
    if (error) throw new Error(adminError(error, "Cover upload failed. Check the public covers bucket."));
    return supabase.storage.from("covers").getPublicUrl(path).data.publicUrl;
  }

  async function save(event, forcedStatus) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setNotice("");
    try {
      const slug = makeSlug(form.title, form.slug);
      if (!form.title.trim() || !form.author.trim() || !form.description.trim()) throw new Error("Title, author and description are required.");
      if (await duplicateSlugExists(slug, novelId)) throw new Error(`Slug “${slug}” already exists. Choose another slug.`);
      const image = await uploadCover();
      const payload = {
        ...toNovelFields(form), slug, image, status: forcedStatus || form.status, ...buildNovelMetadata(form),
        rating: Number(form.rating) || 0, chapters: Number(form.chapters) || 0, views: Number(form.views) || 0,
        bookmarks: Number(form.bookmarks) || 0, meta_title: form.meta_title || form.title,
        meta_description: form.meta_description || form.description, keywords: form.keywords || form.tags || form.genres,
      };
      await safeWrite("novels", payload, (query, next) => (novelId ? query.update(next).eq("id", novelId) : query.insert(next)), ["title", "author"]);
      localStorage.removeItem(draftKey);
      navigate("/admin/novels");
    } catch (error) { setNotice(error.message); }
    finally { setSaving(false); setUploading(false); }
  }

  return <form className="admin-form" onSubmit={save}>
    {notice && <p className="admin-toast">{notice}</p>}
    <div className="admin-form-grid">
      <label>Title<input required value={form.title} onChange={(e) => field("title", e.target.value)} /></label>
      <label>Author<input required value={form.author} onChange={(e) => field("author", e.target.value)} /></label>
      <label>Slug<input value={form.slug} onChange={(e) => field("slug", slugify(e.target.value))} /></label>
      <label>Status<select value={form.status || "Ongoing"} onChange={(e) => field("status", e.target.value)}>{STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="admin-full">Description<textarea rows={6} required value={form.description} placeholder={metadata.description} onChange={(e) => field("description", e.target.value)} /></label>
      <label>Image URL<input value={form.image || ""} onChange={(e) => field("image", e.target.value)} placeholder="https://..." /></label>
      <label>Genres<input value={form.genres || ""} onChange={(e) => field("genres", e.target.value)} placeholder="Fantasy, Action" /></label>
      <label>Rating<input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={(e) => field("rating", e.target.value)} /></label>
      <label>Views<input type="number" min="0" value={form.views} onChange={(e) => field("views", e.target.value)} /></label>
      <label>Bookmarks<input type="number" min="0" value={form.bookmarks} onChange={(e) => field("bookmarks", e.target.value)} /></label>
      <label>Alternative titles<input value={form.alternative_titles || ""} onChange={(e) => field("alternative_titles", e.target.value)} /></label>
      <label>Language<input value={form.language || ""} onChange={(e) => field("language", e.target.value)} placeholder="English" /></label>
      <label className={`admin-full admin-dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); pickCover(e.dataTransfer.files?.[0]); }}>Cover upload<span>{uploading ? "Uploading cover..." : "Validate image type and size, preview, then upload to Supabase Storage on save."}</span><input type="file" accept="image/*" onChange={(e) => pickCover(e.target.files?.[0])} /></label>
    </div>
    <div className="admin-actions">{form.image && <img className="admin-cover-preview" src={form.image} alt="Cover preview" />}<button type="button" className="admin-secondary" onClick={() => { setCoverFile(null); field("image", ""); }}>Remove cover</button></div>
    {preview && <section className="admin-preview"><h2>{form.title || "Untitled"}</h2><p className="admin-muted">{form.author} • {form.genres} • {form.status}</p><p>{form.description || metadata.description}</p></section>}
    <div className="admin-actions"><button type="button" className="admin-secondary" onClick={() => setPreview((value) => !value)}>👁️ Preview</button><button type="button" className="admin-secondary" disabled={saving} onClick={(e) => save(e, "Draft")}>Save draft</button><button disabled={saving || uploading}>{saving ? "Saving..." : "💾 Save"}</button><button type="button" className="admin-secondary" onClick={() => navigate("/admin/novels")}>Cancel</button></div>
    <p className="admin-muted">Optional fields are saved only when the database supports them; service-role keys are never used in the frontend.</p>
  </form>;
}
export default NovelForm;
