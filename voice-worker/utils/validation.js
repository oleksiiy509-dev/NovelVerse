const formats = new Set(['wav', 'mp3', 'ogg']);

export function validateRequest(data = {}) {
  const out = { ...data, format: data.format || 'wav', options: data.options || {} };
  if (out.text !== undefined && (typeof out.text !== 'string' || out.text.trim().length < 1 || out.text.length > 5000)) bad('text must be 1-5000 characters');
  if (out.audio !== undefined && typeof out.audio !== 'string') bad('audio must be a base64 string');
  for (const key of ['voice', 'provider', 'language']) if (out[key] !== undefined && (typeof out[key] !== 'string' || out[key].length > 100)) bad(`${key} is invalid`);
  if (!formats.has(out.format)) bad('format must be wav, mp3, or ogg');
  if (typeof out.options !== 'object' || Array.isArray(out.options)) bad('options must be an object');
  if (out.text) out.text = out.text.trim();
  return out;
}
function bad(message) { const err = new Error(message); err.status = 400; err.code = 'bad_request'; throw err; }
