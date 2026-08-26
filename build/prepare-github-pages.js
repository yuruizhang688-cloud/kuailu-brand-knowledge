import { cp, mkdir, readFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const index = new URL('index.html', dist);
await cp(index, new URL('404.html', dist));

const site = JSON.parse(await readFile(new URL('kb/manifest.json', dist), 'utf8'));
for (const brand of site.brands ?? []) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(brand.slug)) throw new Error(`Invalid brand slug: ${brand.slug}`);
  const route = new URL(`${brand.slug}/`, dist);
  await mkdir(route, { recursive: true });
  await cp(index, new URL('index.html', route));
}

if ((site.brands ?? []).some((brand) => brand.slug === 'kuailu-v2')) {
  const legacyRoute = new URL('kuailu-v1/', dist);
  await mkdir(legacyRoute, { recursive: true });
  await cp(index, new URL('index.html', legacyRoute));
}
