const MAX_ENTRIES = 500;
const PRIVATE_KEYS = /token|password|secret|authorization|email|cookie|session|api[-_]?key/i;

function sanitize(value, seen = new WeakSet()) {
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack?.split("\n").slice(0, 4).join("\n") };
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, PRIVATE_KEYS.test(key) ? "[redacted]" : sanitize(item, seen)]));
}

export class DiagnosticLogger {
  constructor(limit = MAX_ENTRIES) { this.limit = limit; this.entries = []; }
  log(level, category, message, context = {}) {
    const entry = { timestamp: new Date().toISOString(), level, category: String(category || "application"), message: String(message), context: sanitize(context) };
    this.entries.push(entry);
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
    return entry;
  }
  info(category, message, context) { return this.log("info", category, message, context); }
  warn(category, message, context) { return this.log("warning", category, message, context); }
  error(category, message, context) { return this.log("error", category, message, context); }
  export() { return { schemaVersion: 1, exportedAt: new Date().toISOString(), entries: [...this.entries] }; }
  clear() { this.entries.length = 0; }
}

export const diagnosticLogger = new DiagnosticLogger();
