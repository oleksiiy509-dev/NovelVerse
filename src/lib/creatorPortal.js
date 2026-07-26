export const WORKFLOW_STATUSES = ["Draft", "In Review", "Scheduled", "Published", "Archived"];

export function transitionBook(book, status, at = new Date().toISOString()) {
  if (!WORKFLOW_STATUSES.includes(status)) throw new Error(`Unknown publication status: ${status}`);
  return { ...book, status, publicationHistory: [...(book.publicationHistory || []), { status, at }] };
}

export function schedulePublication(book, schedule, now = new Date()) {
  if (!schedule?.date || !schedule?.time || !schedule?.timezone) throw new Error("Date, time and timezone are required");
  const target = new Date(`${schedule.date}T${schedule.time}:00`);
  if (Number.isNaN(target.getTime()) || target <= now) throw new Error("Publication must be scheduled in the future");
  return transitionBook({ ...book, schedule: { ...schedule } }, "Scheduled", now.toISOString());
}

export function createNotification(type, message, at = new Date().toISOString()) {
  const supported = ["render_completed", "export_failed", "publication_finished", "worker_offline", "storage_warning"];
  if (!supported.includes(type)) throw new Error("Unsupported notification type");
  return { id: `${type}-${at}`, type, message, at, read: false };
}

export function createBackup(state, label = "Manual backup", at = new Date().toISOString()) {
  return { id: `backup-${at}`, label, createdAt: at, size: JSON.stringify(state).length, snapshot: structuredClone(state), status: "Ready" };
}

export function restoreBackup(backup) {
  if (!backup?.snapshot || backup.status !== "Ready") throw new Error("Backup is not restorable");
  return structuredClone(backup.snapshot);
}

export function cleanupStorage(storage, selected) {
  return storage.map((item) => selected.includes(item.id) && item.cleanable ? { ...item, used: 0 } : item);
}

export function monitorHealth(metrics) {
  const issues = [];
  if (metrics.cpu >= 90) issues.push("CPU critical");
  if (metrics.ram >= 90) issues.push("RAM critical");
  if (metrics.storage >= 85) issues.push("Storage almost full");
  if (metrics.workersOnline < metrics.workersTotal) issues.push("Worker offline");
  return { status: issues.length ? "Degraded" : "Healthy", issues };
}
