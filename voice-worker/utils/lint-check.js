import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
async function files(dir) { const out = []; for (const ent of await readdir(dir, { withFileTypes: true })) { if (['node_modules', '.cache'].includes(ent.name)) continue; const p = path.join(dir, ent.name); if (ent.isDirectory()) out.push(...await files(p)); else if (p.endsWith('.js')) out.push(p); } return out; }
for (const file of await files(process.cwd())) {
  const text = await readFile(file, 'utf8');
  if (/try\s*\{\s*await?\s*import|try\s*\{\s*import\s/.test(text)) throw new Error(`try/catch import found in ${file}`);
}
console.log('lint check passed');
