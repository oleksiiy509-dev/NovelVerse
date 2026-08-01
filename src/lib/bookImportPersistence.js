import { isSupabaseConfigured, supabase } from "./supabase.js";

async function uploadCover(cover, novelId) {
  if (!cover?.startsWith("blob:")) return cover || null;
  const response = await fetch(cover);
  const blob = await response.blob();
  const extension = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const path = `${novelId}/imported-cover-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("book-assets").upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from("book-assets").getPublicUrl(path).data.publicUrl;
}

export async function saveImportedBookDraft(book) {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured. Configure Studio before saving a draft.");
  const metadata = book?.metadata || {};
  const { data: novel, error: novelError } = await supabase.from("novels").insert({
    title: metadata.title.trim(),
    author: metadata.author.trim(),
    description: metadata.description.trim(),
    language: metadata.language === "Unknown" ? "" : metadata.language.trim(),
    status: "Draft",
  }).select("id").single();
  if (novelError) throw novelError;

  try {
    const coverUrl = await uploadCover(metadata.cover, novel.id);
    if (coverUrl) {
      const { error } = await supabase.from("novels").update({ cover_url: coverUrl }).eq("id", novel.id);
      if (error) throw error;
    }
    const rows = book.chapters.map((chapter, index) => ({
      novel_id: novel.id,
      number: index + 1,
      position: index + 1,
      title: chapter.title.trim() || `Chapter ${index + 1}`,
      content: chapter.content,
      status: "Draft",
      audio_status: "Missing",
      audio_url: null,
    }));
    const { error } = await supabase.from("chapters").insert(rows);
    if (error) throw error;
    return novel.id;
  } catch (error) {
    await supabase.from("novels").delete().eq("id", novel.id);
    throw error;
  }
}
