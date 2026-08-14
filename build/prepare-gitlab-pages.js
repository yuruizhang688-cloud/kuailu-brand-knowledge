import { cp } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
await cp(new URL('index.html', dist), new URL('404.html', dist));
