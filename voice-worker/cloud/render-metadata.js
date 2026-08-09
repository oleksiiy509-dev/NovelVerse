export class SupabaseRenderMetadata {
  constructor(config, fetchImpl = fetch) { this.config = config; this.fetch = fetchImpl; }
  get enabled() { return Boolean(this.config.supabaseUrl && this.config.supabaseServiceRoleKey); }
  headers(extra = {}) { return { apikey: this.config.supabaseServiceRoleKey, authorization: `Bearer ${this.config.supabaseServiceRoleKey}`, 'content-type': 'application/json', ...extra }; }
  endpoint(query = '') { return `${this.config.supabaseUrl.replace(/\/$/, '')}/rest/v1/chapter_audio_renders${query}`; }

  async parse(response) {
    if (!response.ok) throw Object.assign(new Error(`Supabase metadata request failed (${response.status})`), { status: 502, code: 'metadata_error' });
    return response.status === 204 ? null : response.json();
  }

  async get(chapterId) {
    if (!this.enabled) return null;
    const rows = await this.parse(await this.fetch(this.endpoint(`?chapter_id=eq.${encodeURIComponent(chapterId)}&limit=1`), { headers: this.headers() }));
    return rows[0] || null;
  }

  async save(record) {
    if (!this.enabled) return record;
    const payload = { chapter_id: record.request.chapterId, job_id: record.id, status: record.status, provider: record.request.provider,
      object_key: record.objectKey || null, content_type: record.contentType || null, byte_size: record.size || null,
      duration_seconds: record.duration || null, completed_segments: record.completed, total_segments: record.total,
      request: record.request, error_message: record.error || null, attempts: record.attempts || 0,
      heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const response = await this.fetch(this.endpoint('?on_conflict=chapter_id'), { method: 'POST', headers: this.headers({ prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(payload) });
    await this.parse(response); return record;
  }

  async resumable() {
    if (!this.enabled) return [];
    return this.parse(await this.fetch(this.endpoint('?status=in.(queued,rendering,uploading,retry)&select=*'), { headers: this.headers() }));
  }


  async delete(chapterId) {
    if (!this.enabled) return;
    await this.parse(await this.fetch(this.endpoint(`?chapter_id=eq.${encodeURIComponent(chapterId)}`), { method: 'DELETE', headers: this.headers() }));
  }
}
