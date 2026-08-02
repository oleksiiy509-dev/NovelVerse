import { isSupabaseConfigured, supabase } from "./supabase.js";
import { planChapterMerge } from "./bookImportMerge.js";

const normalizeIdentity = (value = "") => String(value).trim().replace(/\s+/g, " ").toLocaleLowerCase();

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

export async function findImportedNovel(metadata = {}) {
  const title = metadata.title?.trim();
  const author = metadata.author?.trim();
  if (!title || !author) return null;
  const { data, error } = await supabase.from("novels").select("id,title,author").ilike("title", title);
  if (error) throw error;
  const wantedTitle = normalizeIdentity(title);
  const wantedAuthor = normalizeIdentity(author);
  return data?.find((novel) => normalizeIdentity(novel.title) === wantedTitle && normalizeIdentity(novel.author) === wantedAuthor) || null;
}

export async function saveImportedBookDraft(book, { createNew = false } = {}) {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured. Configure Studio before saving a draft.");
  const metadata = book?.metadata || {};
  let novel = createNew ? null : await findImportedNovel(metadata);
  let created = false;
  if (!novel) {
    const { data, error } = await supabase.from("novels").insert({
      title: metadata.title.trim(), author: metadata.author.trim(), description: metadata.description.trim(),
      language: metadata.language === "Unknown" ? "" : metadata.language.trim(), status: "Draft",
    }).select("id").single();
    if (error) throw error;
    novel = data;
    created = true;
  }
  try {
    if (created) {
      const coverUrl = await uploadCover(metadata.cover, novel.id);
      if (coverUrl) {
        const { error } = await supabase.from("novels").update({ cover_url: coverUrl }).eq("id", novel.id);
        if (error) throw error;
      }
    }
    const { data: existing, error: existingError } = await supabase.from("chapters").select("number").eq("novel_id", novel.id);
    if (existingError) throw existingError;
    const { additions, skipped } = planChapterMerge(book.chapters, existing?.map((chapter) => chapter.number) || []);
    const rows = additions.map((chapter) => ({
      novel_id: novel.id, number: chapter.number, position: chapter.number,
      title: chapter.title.trim() || `Chapter ${chapter.number}`, content: chapter.content,
      status: "Draft", audio_status: "Missing", audio_url: null,
    }));
    if (rows.length) {
      const { error } = await supabase.from("chapters").insert(rows);
      if (error) throw error;
    }
    return { novelId: novel.id, added: rows.length, skipped, created };
  } catch (error) {
    if (created) await supabase.from("novels").delete().eq("id", novel.id);
    throw error;
  }
}
