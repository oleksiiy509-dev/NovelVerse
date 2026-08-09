import { createHash, createHmac } from 'node:crypto';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');

export class R2AudioStore {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  get enabled() { return Boolean(this.config.r2Endpoint && this.config.r2Bucket && this.config.r2AccessKeyId && this.config.r2SecretAccessKey); }

  async request(method, key, { body, contentType, range } = {}) {
    const endpoint = new URL(this.config.r2Endpoint);
    const pathname = `/${encodeURIComponent(this.config.r2Bucket)}/${encodeKey(key)}`;
    const now = new Date();
    const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = stamp.slice(0, 8);
    const payloadHash = hash(body || Buffer.alloc(0));
    const headers = { host: endpoint.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': stamp };
    if (contentType) headers['content-type'] = contentType;
    if (range) headers.range = range;
    const names = Object.keys(headers).sort();
    const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('');
    const scope = `${date}/auto/s3/aws4_request`;
    const canonical = [method, pathname, '', canonicalHeaders, names.join(';'), payloadHash].join('\n');
    const toSign = ['AWS4-HMAC-SHA256', stamp, scope, hash(canonical)].join('\n');
    const dateKey = hmac(`AWS4${this.config.r2SecretAccessKey}`, date);
    const signingKey = hmac(hmac(hmac(dateKey, 'auto'), 's3'), 'aws4_request');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.config.r2AccessKeyId}/${scope},SignedHeaders=${names.join(';')},Signature=${createHmac('sha256', signingKey).update(toSign).digest('hex')}`;
    const response = await this.fetch(new URL(pathname, endpoint), { method, headers, body });
    if (!response.ok) throw Object.assign(new Error(`R2 ${method} failed (${response.status})`), { status: 502, code: 'r2_error' });
    return response;
  }

  async put(key, bytes, contentType) {
    const objectKey = this.config.r2KeyPrefix ? `${this.config.r2KeyPrefix}/${key}` : key;
    await this.request('PUT', objectKey, { body: bytes, contentType });
    return { key: objectKey, contentType, size: bytes.length };
  }

  get(key, range) { return this.request('GET', key, { range }); }

  async delete(key) {
    await this.request('DELETE', key);
    return true;
  }
}
