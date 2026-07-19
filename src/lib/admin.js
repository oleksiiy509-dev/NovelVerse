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
