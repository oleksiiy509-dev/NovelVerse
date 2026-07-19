const supabaseUrl = "https://kpjqwfeveugjxfwuvwpe.supabase.co";
const supabaseKey = "sb_publishable_Nr6TiCkqZOrNL6MDOpGSNw_feMGUmqO";

const expiredSessionMessage = "Your session has expired. Please sign in again to continue.";

const headers = ({ useAnonKey = false } = {}) => ({
  apikey: supabaseKey,
  Authorization: `Bearer ${useAnonKey ? supabaseKey : localStorage.getItem("supabase_token") || supabaseKey}`,
  "Content-Type": "application/json",
});

function authResponse(data, error = null) {
  return { data, error };
}

function isExpiredJwtError(error, status) {
  const message = String(error?.message || error?.msg || error?.error_description || error?.error || "");
  return status === 401 || message.toLowerCase().includes("jwt expired");
}

function normalizeError(error, status) {
  if (!isExpiredJwtError(error, status)) return error;
  return { ...error, status, message: expiredSessionMessage, expiredSession: true };
}

function clearExpiredAccessToken() {
  localStorage.removeItem("supabase_token");
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.action = "select";
    this.params = new URLSearchParams();
    this.options = {};
    this.payload = null;
  }

  select(columns = "*", options = {}) {
    this.action = "select";
    this.params.set("select", columns.replace(/\s+/g, " ").trim());
    this.options = { ...this.options, ...options };
    return this;
  }

  insert(payload) { this.action = "insert"; this.payload = payload; return this; }
  upsert(payload, options = {}) { this.action = "upsert"; this.payload = payload; this.options = { ...this.options, ...options, resolution: "merge-duplicates" }; return this; }
  update(payload) { this.action = "update"; this.payload = payload; return this; }
  delete() { this.action = "delete"; return this; }
  eq(column, value) { this.params.append(column, `eq.${value}`); return this; }
  neq(column, value) { this.params.append(column, `neq.${value}`); return this; }
  in(column, values) { this.params.append(column, `in.(${(values || []).join(",")})`); return this; }
  ilike(column, value) { this.params.append(column, `ilike.${value}`); return this; }
  or(filter) { this.params.append("or", `(${filter})`); return this; }
  lt(column, value) { this.params.append(column, `lt.${value}`); return this; }
  gt(column, value) { this.params.append(column, `gt.${value}`); return this; }
  gte(column, value) { this.params.append(column, `gte.${value}`); return this; }
  range(from, to) { this.options.range = { from, to }; return this; }
  limit(count) { this.params.set("limit", count); return this; }
  order(column, { ascending = true } = {}) { this.params.append("order", `${column}.${ascending ? "asc" : "desc"}`); return this; }
  single() { this.options.single = true; return this; }
  maybeSingle() { this.options.maybeSingle = true; return this; }
  then(resolve, reject) { return this.execute().then(resolve, reject); }

  async request({ useAnonKey = false } = {}) {
    if (this.options.onConflict) this.params.set("on_conflict", this.options.onConflict);
    const url = `${supabaseUrl}/rest/v1/${this.table}?${this.params}`;
    const method = { select: "GET", insert: "POST", upsert: "POST", update: "PATCH", delete: "DELETE" }[this.action];
    const response = await fetch(url, {
      method,
      headers: {
        ...headers({ useAnonKey }),
        Prefer: this.options.count === "exact" ? "count=exact" : `return=representation${this.options.resolution ? `,resolution=${this.options.resolution}` : ""}`,
        ...(this.options.range ? { Range: `${this.options.range.from}-${this.options.range.to}` } : {}),
      },
      body: this.payload ? JSON.stringify(this.payload) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      return { data: null, error: normalizeError(error, response.status), status: response.status };
    }

    if (this.options.head) {
      const range = response.headers.get("content-range");
      const count = range ? Number(range.split("/").pop()) : null;
      return { data: null, count, error: null };
    }

    const json = response.status === 204 ? null : await response.json();
    const data = this.options.single || this.options.maybeSingle ? Array.isArray(json) ? json[0] || null : json : json;
    return { data, error: null };
  }

  async execute() {
    try {
      const result = await this.request();
      if (isExpiredJwtError(result.error, result.status)) {
        clearExpiredAccessToken();
        if (this.action === "select") return this.request({ useAnonKey: true });
      }
      return result;
    } catch (error) {
      return { data: null, error };
    }
  }
}

export const supabase = {
  from(table) { return new QueryBuilder(table); },
  auth: {
    async getUser() { return authResponse({ user: JSON.parse(localStorage.getItem("supabase_user") || "null") }); },
    async signUp({ email, password, options = {} }) {
      const response = await fetch(`${supabaseUrl}/auth/v1/signup`, { method: "POST", headers: headers({ useAnonKey: true }), body: JSON.stringify({ email, password, data: options.data }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) return authResponse(null, data || { message: response.statusText });
      localStorage.setItem("supabase_user", JSON.stringify(data.user));
      if (data.access_token) localStorage.setItem("supabase_token", data.access_token);
      return authResponse(data);
    },
    async signInWithPassword({ email, password }) {
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, { method: "POST", headers: headers({ useAnonKey: true }), body: JSON.stringify({ email, password }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) return authResponse(null, data || { message: response.statusText });
      localStorage.setItem("supabase_user", JSON.stringify(data.user));
      if (data.access_token) localStorage.setItem("supabase_token", data.access_token);
      return authResponse(data);
    },
    async signOut() { localStorage.removeItem("supabase_user"); localStorage.removeItem("supabase_token"); return authResponse(null); },
  },
  storage: {
    from(bucket) { return { async upload(path, file) { const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, { method: "POST", headers: { apikey: supabaseKey, Authorization: headers().Authorization }, body: file }); if (response.ok) return { data: { path }, error: null }; const error = normalizeError(await response.json().catch(() => ({ message: response.statusText })), response.status); if (error.expiredSession) clearExpiredAccessToken(); return { data: null, error }; }, getPublicUrl(path) { return { data: { publicUrl: `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}` } }; } }; },
  },
};
