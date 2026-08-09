/* global process, console */
import { readFileSync } from 'node:fs';

const filename = process.argv[2] || '.env.production';
const values = Object.fromEntries(readFileSync(filename, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const at = line.indexOf('=');
  return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, '')];
}));
const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VOICE_WORKER_TOKEN', 'R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
const errors = required.filter((key) => !values[key]).map((key) => `${key} is required`);
if (values.VITE_SUPABASE_URL && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(values.VITE_SUPABASE_URL)) errors.push('VITE_SUPABASE_URL must be a Supabase HTTPS URL');
if (values.SUPABASE_URL && values.SUPABASE_URL !== values.VITE_SUPABASE_URL) errors.push('SUPABASE_URL and VITE_SUPABASE_URL must match');
if ((values.VOICE_WORKER_TOKEN || '').length < 32) errors.push('VOICE_WORKER_TOKEN must be at least 32 characters');
if (Object.values(values).some((value) => /your-|change-me|example\.com/i.test(value))) errors.push('placeholder values are not allowed');
if (errors.length) {
  console.error(`Invalid ${filename}:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`${filename}: production environment is valid`);
