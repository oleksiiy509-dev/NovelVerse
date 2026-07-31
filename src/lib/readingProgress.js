export function toReadingProgressRow(record) {
  return {
    user_id: record.user_id,
    novel_id: record.novel_id,
    chapter_id: record.chapter_id,
    progress_percent: record.progress_percent ?? record.progress ?? 0,
    scroll_position: record.scroll_position ?? record.scroll_y ?? 0,
    updated_at: record.updated_at || new Date().toISOString(),
  };
}
