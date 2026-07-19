export const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function isAdminUser(user) {
  if (!user) return false;
  const role = user.user_metadata?.role || user.app_metadata?.role;
  const email = user.email?.toLowerCase();
  return role === "admin" || user.user_metadata?.is_admin === true || ADMIN_EMAILS.includes(email);
}

export async function requireAdmin(supabase) {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null, allowed: false, error };
  const user = data?.user || null;
  return { user, allowed: isAdminUser(user), error: null };
}

export function slugify(value = "file") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґё._-]+/giu, "-")
    .replace(/^-+|-+$/g, "") || "file";
}

export function markdownToText(markdown = "") {
  return String(markdown)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>~-]/g, "")
    .trim();
}

export function stripMarkup(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<h[1-6][^>]*>/gi, "\n# ")
    .replace(/<\/p>|<br\s*\/?>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function splitIntoChapters(text = "", fallbackTitle = "Chapter") {
  const clean = String(text).replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const chapterPattern = /(^|\n)(?:#{1,3}\s*)?(chapter|глава|розділ)\s+([\divxlcdm]+|\d+)[^\n]*/giu;
  const matches = [...clean.matchAll(chapterPattern)];
  if (!matches.length) return [{ title: fallbackTitle, content: clean }];
  return matches.map((match, index) => {
    const start = match.index + (match[1] ? 1 : 0);
    const end = matches[index + 1]?.index ?? clean.length;
    const block = clean.slice(start, end).trim();
    const [heading, ...body] = block.split("\n");
    return { title: heading.replace(/^#{1,3}\s*/, "").trim() || `${fallbackTitle} ${index + 1}`, content: body.join("\n").trim() || block };
  });
}

export function buildNovelMetadata(form) {
  const title = form.title || "Untitled Novel";
  const genres = form.genres?.trim();
  const description = form.description?.trim() || `${title} by ${form.author || "Unknown author"}. ${genres ? `Genres: ${genres}.` : "Add a synopsis before publishing."}`;
  return { description };
}
