import { isSupabaseConfigured, supabase } from "./supabase.js";
import { callChapterAudioGeneration, getChapterAudioMetadata } from "./chapterAudio.js";
import { synthesizeVoiceWorkerAudio } from "./voiceWorker.js";
import { splitIntoChapters, stripMarkup } from "./admin.js";

const textDecoder = new TextDecoder();

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open compressed ZIP files");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer) {
  const bytes = new Uint8Array(buffer); const view = new DataView(buffer); const files = [];
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("The ZIP archive is invalid");
  const entries = view.getUint16(end + 10, true); let offset = view.getUint32(end + 16, true);
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("The ZIP directory is invalid");
    const method = view.getUint16(offset + 10, true); const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true); const extraLength = view.getUint16(offset + 30, true); const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true); const name = textDecoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`The ZIP entry ${name} is invalid`);
    const localNameLength = view.getUint16(localOffset + 26, true); const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength; const compressed = bytes.slice(start, start + compressedSize);
    if (!name.endsWith("/")) {
      if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method in ${name}`);
      files.push({ name, bytes: method === 8 ? await inflateRaw(compressed) : compressed });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (!files.length) throw new Error("The ZIP archive is empty or invalid");
  return files;
}

function docxText(xml) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("The DOCX document is invalid");
  return [...document.getElementsByTagNameNS("*", "p")].map((paragraph) => [...paragraph.getElementsByTagNameNS("*", "t")].map((node) => node.textContent).join("")).join("\n");
}

async function textFromDocx(bytes) {
  const entries = await unzip(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const document = entries.find((entry) => entry.name === "word/document.xml");
  if (!document) throw new Error("The selected file is not a valid DOCX document");
  return docxText(textDecoder.decode(document.bytes));
}

async function chaptersFromNamedBytes(name, bytes) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx")) return splitIntoChapters(await textFromDocx(bytes), name.replace(/\.docx$/i, ""));
  if (lower.endsWith(".txt")) return splitIntoChapters(textDecoder.decode(bytes), name.replace(/\.txt$/i, ""));
  throw new Error(`${name} is not a TXT or DOCX document`);
}

export async function importBookFiles(files) {
  const results = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (file.name.toLowerCase().endsWith(".zip")) {
      const entries = await unzip(bytes.buffer);
      for (const entry of entries.filter(({ name }) => /\.(txt|docx)$/i.test(name))) results.push(...await chaptersFromNamedBytes(entry.name, entry.bytes));
    } else results.push(...await chaptersFromNamedBytes(file.name, bytes));
  }
  return results.filter(({ content }) => content?.trim());
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}

export async function generateManagedAudio(chapter) {
  if (!stripMarkup(chapter.content)) throw new Error("Add chapter text before generating audio");
  if (isSupabaseConfigured) {
    await callChapterAudioGeneration(chapter.id, "auto", "default");
    const metadata = await getChapterAudioMetadata(chapter.id);
    if (!metadata.playbackUrl) throw metadata.error || new Error("Audio generation did not return a playable file");
    return metadata.playbackUrl;
  }
  const result = await synthesizeVoiceWorkerAudio({ text: stripMarkup(chapter.content), language: "en", voice: "en_US-lessac-medium" });
  return blobToDataUrl(result.blob);
}

export async function loadPublishedManagedBooks() {
  if (!isSupabaseConfigured) {
    try { return (JSON.parse(localStorage.getItem("novelverse.book-management.v1") || "[]") || []).filter((book) => book.status === "Published"); } catch { return []; }
  }
  const { data, error } = await supabase.from("books").select("id,title,author,description,genres,status,cover_url,created_at,chapters(id)").eq("status", "Published").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export function managedBookToCatalog(book) {
  return { id: `book-${book.id}`, managedBookId: book.id, title: book.title, author: book.author, description: book.description, genres: Array.isArray(book.genres) ? book.genres.join(", ") : book.genres || "", image: book.coverUrl || book.cover_url || "", chapters: Array.isArray(book.chapters) ? book.chapters.length : Number(book.chapters || 0), status: "Completed", rating: 0, views: 0, bookmarks: 0, created_at: book.createdAt || book.created_at };
}
