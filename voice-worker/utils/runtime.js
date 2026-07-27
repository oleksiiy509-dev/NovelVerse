import { randomUUID } from 'node:crypto';

export class WorkQueue {
  constructor({ concurrency = 2, maxPending = 50, timeoutMs = 60_000 } = {}) {
    this.concurrency = concurrency;
    this.maxPending = maxPending;
    this.timeoutMs = timeoutMs;
    this.active = 0;
    this.pending = [];
    this.accepting = true;
  }

  get status() { return { active: this.active, pending: this.pending.length, concurrency: this.concurrency, maxPending: this.maxPending, accepting: this.accepting }; }

  run(task) {
    if (!this.accepting) return Promise.reject(httpError(503, 'shutting_down', 'Worker is shutting down'));
    if (this.pending.length >= this.maxPending) return Promise.reject(httpError(503, 'queue_full', 'Worker queue is full; retry later'));
    return new Promise((resolve, reject) => {
      this.pending.push({ task, resolve, reject });
      this.#drain();
    });
  }

  stop() { this.accepting = false; }

  #drain() {
    while (this.accepting && this.active < this.concurrency && this.pending.length) {
      const job = this.pending.shift();
      this.active += 1;
      let settled = false;
      const timer = setTimeout(() => { settled = true; job.reject(httpError(504, 'job_timeout', 'Voice job timed out')); }, this.timeoutMs);
      Promise.resolve().then(job.task).then(
        (value) => { if (!settled) job.resolve(value); },
        (error) => { if (!settled) job.reject(error); },
      ).finally(() => { settled = true; clearTimeout(timer); this.active -= 1; this.#drain(); });
    }
  }
}

export function httpError(status, code, message) { return Object.assign(new Error(message), { status, code }); }

export function createRuntime(cfg) {
  return {
    startedAt: Date.now(),
    queue: new WorkQueue({ concurrency: cfg.queueConcurrency, maxPending: cfg.maxPending, timeoutMs: cfg.timeoutMs }),
    metrics: { requests: 0, errors: 0, rateLimited: 0, queueRejected: 0, cacheHits: 0, cacheMisses: 0, latencyMs: 0 },
  };
}

export function requestId(value) {
  return /^[a-zA-Z0-9._-]{1,128}$/.test(value || '') ? value : randomUUID();
}
