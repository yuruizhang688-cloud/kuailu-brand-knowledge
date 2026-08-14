import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, 'data', 'comments.json');
const appRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(appRoot, '..');
const layerRoots = {
  source: path.join(workspaceRoot, '01-source-files'),
  register: path.join(workspaceRoot, '02-source-register'),
  content: path.join(workspaceRoot, '03-content-source'),
  assets: path.join(workspaceRoot, '04-assets')
};
const kbRoot = path.join(appRoot, 'public', 'kb');
const app = express();

app.use(cors({ methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json({ limit: '64kb' }));

const text = (value, maximum) => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
const keyHash = (key) => createHash('sha256').update(key).digest('hex');
const stripOrder = (value) => value.replace(/^\d+[._ -]*/, '');

function layerPath(layer, relativePath = '') {
  const root = layerRoots[layer];
  if (!root) throw new Error('未知资料层');
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('无效文件路径');
  return resolved;
}

async function ensureWorkspace() {
  await Promise.all([...Object.values(layerRoots), kbRoot].map((directory) => mkdir(directory, { recursive: true })));
}

async function listFiles(directory, relative = '') {
  const absolute = path.join(directory, relative);
  const entries = await readdir(absolute, { withFileTypes: true });
  const results = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))) {
    if (entry.name.startsWith('.')) continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) results.push({ type: 'folder', name: entry.name, path: next, children: await listFiles(directory, next) });
    else {
      const info = await stat(path.join(directory, next));
      results.push({ type: 'file', name: entry.name, path: next, size: info.size, updatedAt: info.mtime.toISOString() });
    }
  }
  return results;
}

function flattenFiles(nodes) {
  return nodes.flatMap((node) => node.type === 'file' ? [node] : flattenFiles(node.children));
}

function markdownTitle(markdown, fallback) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || stripOrder(fallback.replace(/\.md$/i, ''));
}

function stableId(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function insertTree(tree, doc) {
  const folders = doc.relativePath.split(path.sep).slice(0, -1);
  let nodes = tree;
  let folderPath = '';
  for (const folder of folders) {
    folderPath = path.join(folderPath, folder);
    let item = nodes.find((node) => node.type === 'folder' && node.id === `folder:${folderPath}`);
    if (!item) {
      item = { id: `folder:${folderPath}`, type: 'folder', label: folder, count: 0, children: [] };
      nodes.push(item);
    }
    item.count += 1;
    nodes = item.children;
  }
  nodes.push({ id: doc.id, type: 'file', label: path.basename(doc.relativePath, '.md'), title: doc.title, unitCount: doc.unitCount });
}

async function buildKnowledgeBase() {
  await ensureWorkspace();
  const brandDirs = (await readdir(layerRoots.content, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const previousOutputs = await readdir(kbRoot, { withFileTypes: true });
  await Promise.all(previousOutputs.filter((entry) => entry.isDirectory()).map((entry) => rm(path.join(kbRoot, entry.name), { recursive: true, force: true })));
  const brands = [];
  for (const slug of brandDirs) {
    const sourceRoot = path.join(layerRoots.content, slug);
    const configPath = path.join(sourceRoot, 'brand.json');
    let config = {};
    try { config = JSON.parse(await readFile(configPath, 'utf8')); } catch { config = {}; }
    const sourceTree = await listFiles(sourceRoot);
    const markdownFiles = flattenFiles(sourceTree).filter((file) => file.path.endsWith('.md'));
    const docs = [];
    const tree = [];
    const outputRoot = path.join(kbRoot, slug);
    await mkdir(path.join(outputRoot, 'docs'), { recursive: true });
    for (const file of markdownFiles) {
      const markdown = await readFile(path.join(sourceRoot, file.path), 'utf8');
      const relativePath = file.path;
      const title = markdownTitle(markdown, file.name);
      const breadcrumbs = relativePath.split(path.sep).slice(0, -1).map(stripOrder).concat(title);
      const id = stableId(`${slug}:${relativePath}`);
      const doc = { id, title, label: path.basename(relativePath, '.md'), relativePath, breadcrumbs, category: breadcrumbs[0] ?? '概览', readTime: Math.max(1, Math.ceil(markdown.replace(/\s/g, '').length / 500)), unitCount: 1, contentUrl: `kb/${slug}/docs/${id}.json` };
      docs.push(doc);
      insertTree(tree, doc);
      await writeFile(path.join(outputRoot, 'docs', `${id}.json`), JSON.stringify({ ...doc, markdown }, null, 2));
    }
    const entries = docs.map((doc) => ({ ...doc, text: '' }));
    for (const entry of entries) entry.text = JSON.parse(await readFile(path.join(outputRoot, 'docs', `${entry.id}.json`), 'utf8')).markdown.replace(/^#+\s+/gm, '').replace(/[`*_>|]/g, ' ').replace(/\s+/g, ' ').trim();
    await mkdir(path.join(outputRoot, 'search'), { recursive: true });
    await writeFile(path.join(outputRoot, 'search', 'all.json'), JSON.stringify({ id: 'all', label: '全部内容', entries }, null, 2));
    const manifest = { slug, displayName: config.displayName ?? stripOrder(slug), shortName: config.shortName ?? config.displayName ?? stripOrder(slug), initials: config.initials ?? 'KB', docCount: docs.length, knowledgePointCount: docs.reduce((sum, doc) => sum + doc.unitCount, 0), defaultDocId: docs[0]?.id ?? null, exportUrl: `kb/${slug}/export.json`, generatedAt: new Date().toISOString(), docs, tree, searchChunks: [{ id: 'all', label: '全部内容', url: `kb/${slug}/search/all.json`, count: docs.length }] };
    await writeFile(path.join(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await writeFile(path.join(outputRoot, 'export.json'), JSON.stringify({ slug, generatedAt: manifest.generatedAt, docs: await Promise.all(docs.map(async (doc) => ({ id: doc.id, relativePath: doc.relativePath, markdown: JSON.parse(await readFile(path.join(outputRoot, 'docs', `${doc.id}.json`), 'utf8')).markdown }))) }, null, 2));
    brands.push({ slug, displayName: manifest.displayName, shortName: manifest.shortName, initials: manifest.initials, docCount: manifest.docCount, knowledgePointCount: manifest.knowledgePointCount, manifestUrl: `kb/${slug}/manifest.json` });
  }
  const site = { generatedAt: new Date().toISOString(), defaultBrand: brands[0]?.slug ?? null, brands };
  await writeFile(path.join(kbRoot, 'manifest.json'), JSON.stringify(site, null, 2));
  return { brands: brands.length, docs: brands.reduce((sum, brand) => sum + brand.docCount, 0), site };
}

await ensureWorkspace();

async function loadComments() {
  try {
    return JSON.parse(await readFile(dataFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveComments(comments) {
  await mkdir(path.dirname(dataFile), { recursive: true });
  const temporary = `${dataFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(comments, null, 2), 'utf8');
  await rename(temporary, dataFile);
}

function present(comment, editKey) {
  const { editKeyHash, ...safe } = comment;
  return { ...safe, canEdit: Boolean(editKey && keyHash(editKey) === editKeyHash) };
}

app.get('/api/comments', async (request, response, next) => {
  try {
    const { brandSlug, docId, editKey = '' } = request.query;
    if (!text(brandSlug, 120) || !text(docId, 120)) return response.status(400).json({ error: 'brandSlug 和 docId 必填' });
    const comments = (await loadComments())
      .filter((item) => item.brandSlug === brandSlug && item.docId === docId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => present(item, editKey));
    response.json({ comments });
  } catch (error) { next(error); }
});

app.post('/api/comments', async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (body.website) return response.status(400).json({ error: '无效请求' });
    const required = ['brandSlug', 'docId', 'relativePath', 'authorName', 'comment', 'editKey'];
    if (required.some((field) => !text(body[field], field === 'comment' ? 3000 : 500))) {
      return response.status(400).json({ error: '缺少或包含无效字段' });
    }
    const now = new Date().toISOString();
    const comment = {
      id: randomUUID(), brandSlug: body.brandSlug, docId: body.docId, relativePath: body.relativePath,
      authorName: body.authorName.trim(), comment: body.comment.trim(), suggestedText: String(body.suggestedText ?? '').slice(0, 3000),
      selectedText: String(body.selectedText ?? '').slice(0, 1200), contextBefore: String(body.contextBefore ?? '').slice(0, 500),
      contextAfter: String(body.contextAfter ?? '').slice(0, 500), headingText: String(body.headingText ?? '').slice(0, 300),
      anchorId: String(body.anchorId ?? '').slice(0, 300), createdAt: now, updatedAt: now, editKeyHash: keyHash(body.editKey)
    };
    const comments = await loadComments();
    comments.push(comment);
    await saveComments(comments);
    response.status(201).json({ comment: present(comment, body.editKey) });
  } catch (error) { next(error); }
});

app.patch('/api/comments/:id', async (request, response, next) => {
  try {
    const { comment, suggestedText = '', website = '', editKey = '' } = request.body ?? {};
    if (website) return response.status(400).json({ error: '无效请求' });
    if (!text(comment, 3000) || !text(editKey, 500)) return response.status(400).json({ error: 'comment 和 editKey 必填' });
    const comments = await loadComments();
    const record = comments.find((item) => item.id === request.params.id);
    if (!record) return response.status(404).json({ error: '批注不存在' });
    if (record.editKeyHash !== keyHash(editKey)) return response.status(403).json({ error: '没有修改该批注的权限' });
    record.comment = comment.trim();
    record.suggestedText = String(suggestedText).slice(0, 3000);
    record.updatedAt = new Date().toISOString();
    await saveComments(comments);
    response.json({ comment: present(record, editKey) });
  } catch (error) { next(error); }
});

app.get('/api/manage/overview', async (_request, response, next) => {
  try {
    const layers = {};
    for (const [name, root] of Object.entries(layerRoots)) layers[name] = await listFiles(root);
    const contentFiles = flattenFiles(layers.content).filter((file) => file.path.endsWith('.md'));
    response.json({ workspaceRoot, layers, summary: { sourceFiles: flattenFiles(layers.source).length, contentFiles: contentFiles.length, assetFiles: flattenFiles(layers.assets).length } });
  } catch (error) { next(error); }
});

app.get('/api/manage/file', async (request, response, next) => {
  try {
    const filePath = layerPath(request.query.layer, request.query.path);
    const content = await readFile(filePath, 'utf8');
    response.json({ layer: request.query.layer, path: request.query.path, content });
  } catch (error) { next(error); }
});

app.put('/api/manage/file', async (request, response, next) => {
  try {
    const { layer, path: relativePath, content } = request.body ?? {};
    if (!['content', 'register'].includes(layer) || !relativePath?.endsWith('.md') || typeof content !== 'string') return response.status(400).json({ error: '只能保存 Markdown 内容文件' });
    const filePath = layerPath(layer, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
    response.json({ saved: true, layer, path: relativePath });
  } catch (error) { next(error); }
});

app.post('/api/manage/upload', async (request, response, next) => {
  try {
    const { layer, path: relativePath, base64 } = request.body ?? {};
    if (!['source', 'assets'].includes(layer) || typeof relativePath !== 'string' || typeof base64 !== 'string') return response.status(400).json({ error: '无效上传请求' });
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) return response.status(400).json({ error: '文件须大于 0 且不超过 20 MB' });
    const filePath = layerPath(layer, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
    response.status(201).json({ uploaded: true, layer, path: relativePath, size: bytes.length });
  } catch (error) { next(error); }
});

app.post('/api/manage/build-kb', async (_request, response, next) => {
  try { response.json({ ok: true, result: await buildKnowledgeBase() }); } catch (error) { next(error); }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: '批注服务暂不可用' });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`Comments API listening on http://localhost:${port}`));
