import { createHash, createHmac } from 'node:crypto';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const xmlValue = (xml, name) => new RegExp(`<${name}>([^<]+)</${name}>`).exec(xml)?.[1];

export class R2AudioStore {
  constructor(config, fetchImpl = fetch) { this.config = config; this.fetch = fetchImpl; }
  get enabled() { return Boolean(this.config.r2Endpoint && this.config.r2Bucket && this.config.r2AccessKeyId && this.config.r2SecretAccessKey); }
  objectKey(key) { return this.config.r2KeyPrefix ? `${this.config.r2KeyPrefix}/${key}` : key; }
  pathname(key) { return `/${encodeURIComponent(this.config.r2Bucket)}/${encodeKey(key)}`; }

  signingKey(date) {
    const dateKey = hmac(`AWS4${this.config.r2SecretAccessKey}`, date);
    return hmac(hmac(hmac(dateKey, 'auto'), 's3'), 'aws4_request');
  }

  async request(method, key, { body, contentType, range, query = {}, headers: extraHeaders = {}, expected = [200, 204, 206] } = {}) {
    const endpoint = new URL(this.config.r2Endpoint);
    const pathname = this.pathname(key);
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([name, value]) => [name, String(value)]));
    params.sort();
    const now = new Date();
    const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = stamp.slice(0, 8);
    const payloadHash = sha256(body || Buffer.alloc(0));
    const headers = { host: endpoint.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': stamp, ...extraHeaders };
    if (contentType) headers['content-type'] = contentType;
    if (range) headers.range = range;
    const names = Object.keys(headers).map((name) => name.toLowerCase()).sort();
    const canonicalHeaders = names.map((name) => `${name}:${String(headers[name]).trim()}\n`).join('');
    const scope = `${date}/auto/s3/aws4_request`;
    const canonical = [method, pathname, params.toString(), canonicalHeaders, names.join(';'), payloadHash].join('\n');
    const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256(canonical)].join('\n');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.config.r2AccessKeyId}/${scope},SignedHeaders=${names.join(';')},Signature=${createHmac('sha256', this.signingKey(date)).update(toSign).digest('hex')}`;
    const url = new URL(pathname, endpoint); url.search = params.toString();
    let response;
    const attempts = Math.max(1, this.config.r2RetryAttempts || 4);
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try { response = await this.fetch(url, { method, headers, body }); } catch (error) {
        if (attempt === attempts) throw Object.assign(new Error(`R2 ${method} network failure: ${error.message}`), { status: 502, code: 'r2_error' });
      }
      if (response && (expected.includes(response.status) || (response.status < 500 && response.status !== 429))) break;
      if (attempt < attempts) await sleep((this.config.r2RetryBaseMs || 100) * (2 ** (attempt - 1)));
    }
    if (!response || !expected.includes(response.status)) throw Object.assign(new Error(`R2 ${method} failed (${response?.status || 'network'})`), { status: 502, code: 'r2_error' });
    return response;
  }

  async put(key, bytes, contentType) {
    const objectKey = this.objectKey(key);
    const checksum = sha256(bytes);
    const threshold = this.config.r2MultipartThreshold || 50 * 1024 * 1024;
    if (bytes.length >= threshold) await this.multipartPut(objectKey, bytes, contentType, checksum);
    else await this.request('PUT', objectKey, { body: bytes, contentType, headers: { 'x-amz-meta-sha256': checksum } });
    await this.verify(objectKey, bytes.length, checksum);
    return { key: objectKey, contentType, size: bytes.length, checksum };
  }

  async multipartPut(key, bytes, contentType, checksum) {
    let uploadId;
    try {
      const created = await this.request('POST', key, { query: { uploads: '' }, contentType, headers: { 'x-amz-meta-sha256': checksum } });
      uploadId = xmlValue(await created.text(), 'UploadId');
      if (!uploadId) throw new Error('R2 multipart response did not include UploadId');
      const size = Math.max(5 * 1024 * 1024, this.config.r2MultipartPartSize || 10 * 1024 * 1024);
      const parts = [];
      for (let offset = 0, number = 1; offset < bytes.length; offset += size, number += 1) {
        const response = await this.request('PUT', key, { body: bytes.subarray(offset, offset + size), query: { partNumber: number, uploadId } });
        const etag = response.headers.get('etag');
        if (!etag) throw new Error(`R2 multipart part ${number} did not return an ETag`);
        parts.push(`<Part><PartNumber>${number}</PartNumber><ETag>${etag}</ETag></Part>`);
      }
      const manifest = Buffer.from(`<CompleteMultipartUpload>${parts.join('')}</CompleteMultipartUpload>`);
      await this.request('POST', key, { body: manifest, contentType: 'application/xml', query: { uploadId } });
    } catch (error) {
      if (uploadId) await this.request('DELETE', key, { query: { uploadId } }).catch(() => {});
      throw error;
    }
  }

  async verify(key, size, checksum) {
    try {
      const response = await this.request('HEAD', key);
      if (Number(response.headers.get('content-length')) !== size || response.headers.get('x-amz-meta-sha256') !== checksum) throw new Error('R2 upload integrity check failed');
    } catch (error) { await this.delete(key).catch(() => {}); throw error; }
  }

  get(key, range) { return this.request('GET', key, { range }); }
  async downloadVerified(key, expectedChecksum) {
    const response = await this.get(key);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== expectedChecksum) throw Object.assign(new Error('R2 download checksum mismatch'), { code: 'checksum_mismatch', status: 502 });
    return bytes;
  }
  publicUrl(key) { return this.config.r2PublicBaseUrl ? `${this.config.r2PublicBaseUrl.replace(/\/$/, '')}/${encodeKey(key)}` : null; }
  signedUrl(key, expiresIn = 900) {
    const endpoint = new URL(this.config.r2Endpoint); const now = new Date();
    const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); const date = stamp.slice(0, 8); const scope = `${date}/auto/s3/aws4_request`;
    const query = new URLSearchParams({ 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${this.config.r2AccessKeyId}/${scope}`, 'X-Amz-Date': stamp, 'X-Amz-Expires': String(Math.min(604800, Math.max(1, expiresIn))), 'X-Amz-SignedHeaders': 'host' }); query.sort();
    const canonical = ['GET', this.pathname(key), query.toString(), `host:${endpoint.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
    query.set('X-Amz-Signature', createHmac('sha256', this.signingKey(date)).update(['AWS4-HMAC-SHA256', stamp, scope, sha256(canonical)].join('\n')).digest('hex'));
    const url = new URL(this.pathname(key), endpoint); url.search = query.toString(); return url.toString();
  }
  async delete(key) { await this.request('DELETE', key); return true; }
}
