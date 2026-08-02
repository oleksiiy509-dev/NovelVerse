export function getImportPersistenceError(error) {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = typeof error.message === "string" ? error.message.trim() : "";
    const details = typeof error.details === "string" ? error.details.trim() : "";
    const hint = typeof error.hint === "string" ? error.hint.trim() : "";
    const code = typeof error.code === "string" ? error.code.trim() : "";
    const explanation = [message, details && details !== message ? details : "", hint].filter(Boolean).join(" ");
    if (explanation) return code ? `${explanation} (${code})` : explanation;
  }
  return "Supabase could not import the chapters.";
}
