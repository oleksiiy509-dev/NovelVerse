# End-to-End Audio Generation

1. Analyze Voice Engine segments.
2. Save a ready Voice Director plan.
3. In Audio/Director Studio, choose `openai`, inspect mapping, and generate a sentence/dialogue/scene preview.
4. Generate the full chapter. The endpoint validates authentication, admin rights, chapter, Director plan, cast, provider, cache and limits.
5. Jobs move pending → rendering → rendered or failed with progress, current segment, total segments and retry metadata.
6. Segment files are saved under `segments/...`; final assets use `audio/novels/{novel_id}/chapters/{chapter_id}/renders/{render_hash}/chapter.mp3` metadata shape.
7. Reader requests signed URLs for ready AI audio and falls back to Device Voice when unavailable.
8. Offline downloads store metadata, duration, render hash and timestamp; invalidate only when active render hash changes.
