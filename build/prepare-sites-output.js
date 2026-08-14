import { access, cp, mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '..', 'dist');
const entries = await readdir(dist, { withFileTypes: true });
let workerBundle = '';

for (const entry of entries) {
  if (!entry.isDirectory() || entry.name === 'client' || entry.name === 'server' || entry.name === '.openai') continue;
  const configPath = resolve(dist, entry.name, 'wrangler.json');
  try {
    await access(configPath);
  } catch {
    continue;
  }
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  workerBundle = resolve(dist, entry.name, config.main || 'index.js');
  break;
}

if (!workerBundle) throw new Error('Cloudflare Worker build output was not found.');
await mkdir(resolve(dist, 'server'), { recursive: true });
await cp(workerBundle, resolve(dist, 'server', 'index.js'));
