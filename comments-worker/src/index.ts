type WorkerEnv = Env & { ADMIN_TOKEN: string };

type CommentStatus = 'open' | 'resolved';
type TargetKind = 'document' | 'row' | 'block';

interface CommentRow {
  id: string;
  brand_slug: string;
  doc_id: string;
  relative_path: string;
  doc_title: string;
  target_kind: TargetKind;
  author_name: string;
  comment: string;
  suggested_text: string;
  selected_text: string;
  context_before: string;
  context_after: string;
  heading_text: string;
  anchor_id: string;
  status: CommentStatus;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  edit_key_hash: string;
}

interface CommentBody {
  brandSlug?: unknown;
  docId?: unknown;
  relativePath?: unknown;
  docTitle?: unknown;
  targetKind?: unknown;
  authorName?: unknown;
  comment?: unknown;
  suggestedText?: unknown;
  selectedText?: unknown;
  contextBefore?: unknown;
  contextAfter?: unknown;
  headingText?: unknown;
  anchorId?: unknown;
  status?: unknown;
  editKey?: unknown;
  website?: unknown;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const encoder = new TextEncoder();
const localHostnames = new Set(['localhost', '127.0.0.1', '::1']);
const rowColumns = `id, brand_slug, doc_id, relative_path, doc_title, target_kind,
  author_name, comment, suggested_text, selected_text, context_before, context_after,
  heading_text, anchor_id, status, resolved_at, created_at, updated_at, edit_key_hash`;

function originHostname(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return '';
  }
}

function isLocalOrigin(origin: string): boolean {
  return Boolean(origin && localHostnames.has(originHostname(origin)));
}

function isAllowedOrigin(origin: string, env: WorkerEnv): boolean {
  return origin === env.PUBLIC_SITE_ORIGIN || isLocalOrigin(origin);
}

function responseHeaders(request: Request, env: WorkerEnv): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin'
  });
  const origin = request.headers.get('Origin') || '';
  if (isAllowedOrigin(origin, env)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function json(request: Request, env: WorkerEnv, value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: responseHeaders(request, env) });
}

function preflight(request: Request, env: WorkerEnv): Response {
  const origin = request.headers.get('Origin') || '';
  if (!isAllowedOrigin(origin, env)) return json(request, env, { error: '不允许的请求来源' }, 403);
  const headers = responseHeaders(request, env);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(null, { status: 204, headers });
}

function requireAllowedMutationOrigin(request: Request, env: WorkerEnv): void {
  const origin = request.headers.get('Origin') || '';
  if (!isAllowedOrigin(origin, env)) throw new HttpError(403, '不允许的请求来源');
}

function requiredText(value: unknown, maximum: number, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new HttpError(400, `${field} 缺失或无效`);
  }
  return value.trim();
}

function optionalText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.slice(0, maximum) : '';
}

async function readJsonBody(request: Request): Promise<CommentBody> {
  if (!request.body) throw new HttpError(400, '请求体不能为空');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 64 * 1024) {
      await reader.cancel();
      throw new HttpError(413, '请求体过大');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid object');
    return parsed as CommentBody;
  } catch {
    throw new HttpError(400, '无效 JSON');
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function secureEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right))
  ]);
  return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

async function requireManagementAccess(request: Request, env: WorkerEnv): Promise<void> {
  const origin = request.headers.get('Origin') || '';
  if (origin === env.PUBLIC_SITE_ORIGIN) return;
  if (!isLocalOrigin(origin)) throw new HttpError(403, '不允许的批注管理请求来源');
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token || !env.ADMIN_TOKEN || !(await secureEqual(token, env.ADMIN_TOKEN))) {
    throw new HttpError(401, '管理密钥无效');
  }
}

function present(row: CommentRow, canEdit: boolean) {
  return {
    id: row.id,
    brandSlug: row.brand_slug,
    docId: row.doc_id,
    relativePath: row.relative_path,
    docTitle: row.doc_title,
    targetKind: row.target_kind,
    authorName: row.author_name,
    comment: row.comment,
    suggestedText: row.suggested_text,
    selectedText: row.selected_text,
    contextBefore: row.context_before,
    contextAfter: row.context_after,
    headingText: row.heading_text,
    anchorId: row.anchor_id,
    status: row.status === 'resolved' ? 'resolved' : 'open',
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canEdit
  };
}

async function findComment(env: WorkerEnv, id: string): Promise<CommentRow | null> {
  return env.DB.prepare(`SELECT ${rowColumns} FROM comments WHERE id = ?1`).bind(id).first<CommentRow>();
}

async function getComments(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  const brandSlug = requiredText(url.searchParams.get('brandSlug'), 120, 'brandSlug');
  const docId = requiredText(url.searchParams.get('docId'), 120, 'docId');
  const editKey = optionalText(url.searchParams.get('editKey'), 500);
  const editHash = editKey ? await sha256(editKey) : '';
  const result = await env.DB.prepare(
    `SELECT ${rowColumns} FROM comments WHERE brand_slug = ?1 AND doc_id = ?2 ORDER BY created_at DESC`
  ).bind(brandSlug, docId).all<CommentRow>();
  const comments = await Promise.all(result.results.map(async (row) =>
    present(row, Boolean(editHash && await secureEqual(editHash, row.edit_key_hash)))
  ));
  return json(request, env, { comments });
}

async function createComment(request: Request, env: WorkerEnv): Promise<Response> {
  requireAllowedMutationOrigin(request, env);
  const body = await readJsonBody(request);
  if (body.website) throw new HttpError(400, '无效请求');
  const brandSlug = requiredText(body.brandSlug, 120, 'brandSlug');
  const docId = requiredText(body.docId, 120, 'docId');
  const relativePath = requiredText(body.relativePath, 500, 'relativePath');
  const authorName = requiredText(body.authorName, 80, 'authorName');
  const comment = requiredText(body.comment, 3000, 'comment');
  const editKey = requiredText(body.editKey, 500, 'editKey');
  const targetKind: TargetKind = ['document', 'row', 'block'].includes(String(body.targetKind)) ? body.targetKind as TargetKind : 'document';
  const now = new Date().toISOString();
  const row: CommentRow = {
    id: crypto.randomUUID(), brand_slug: brandSlug, doc_id: docId, relative_path: relativePath,
    doc_title: optionalText(body.docTitle, 300), target_kind: targetKind, author_name: authorName, comment,
    suggested_text: optionalText(body.suggestedText, 3000), selected_text: optionalText(body.selectedText, 1200),
    context_before: optionalText(body.contextBefore, 500), context_after: optionalText(body.contextAfter, 500),
    heading_text: optionalText(body.headingText, 300), anchor_id: optionalText(body.anchorId, 300),
    status: 'open', resolved_at: null, created_at: now, updated_at: now, edit_key_hash: await sha256(editKey)
  };
  await env.DB.prepare(`INSERT INTO comments (${rowColumns}) VALUES
    (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`)
    .bind(row.id, row.brand_slug, row.doc_id, row.relative_path, row.doc_title, row.target_kind,
      row.author_name, row.comment, row.suggested_text, row.selected_text, row.context_before,
      row.context_after, row.heading_text, row.anchor_id, row.status, row.resolved_at,
      row.created_at, row.updated_at, row.edit_key_hash).run();
  return json(request, env, { comment: present(row, true) }, 201);
}

async function updateOwnComment(request: Request, env: WorkerEnv, id: string): Promise<Response> {
  requireAllowedMutationOrigin(request, env);
  const body = await readJsonBody(request);
  if (body.website) throw new HttpError(400, '无效请求');
  const comment = requiredText(body.comment, 3000, 'comment');
  const editKey = requiredText(body.editKey, 500, 'editKey');
  const row = await findComment(env, id);
  if (!row) throw new HttpError(404, '批注不存在');
  if (!(await secureEqual(await sha256(editKey), row.edit_key_hash))) throw new HttpError(403, '没有修改该批注的权限');
  row.comment = comment;
  row.suggested_text = optionalText(body.suggestedText, 3000);
  row.updated_at = new Date().toISOString();
  await env.DB.prepare('UPDATE comments SET comment = ?1, suggested_text = ?2, updated_at = ?3 WHERE id = ?4')
    .bind(row.comment, row.suggested_text, row.updated_at, row.id).run();
  return json(request, env, { comment: present(row, true) });
}

async function deleteOwnComment(request: Request, env: WorkerEnv, id: string): Promise<Response> {
  requireAllowedMutationOrigin(request, env);
  const body = await readJsonBody(request);
  const editKey = requiredText(body.editKey, 500, 'editKey');
  const row = await findComment(env, id);
  if (!row) throw new HttpError(404, '批注不存在');
  if (!(await secureEqual(await sha256(editKey), row.edit_key_hash))) throw new HttpError(403, '没有删除该批注的权限');
  await env.DB.prepare('DELETE FROM comments WHERE id = ?1').bind(row.id).run();
  return json(request, env, { deleted: true });
}

async function listManagedComments(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  await requireManagementAccess(request, env);
  const brandSlug = optionalText(url.searchParams.get('brandSlug'), 120).trim();
  const statement = brandSlug
    ? env.DB.prepare(`SELECT ${rowColumns} FROM comments WHERE brand_slug = ?1 ORDER BY created_at DESC`).bind(brandSlug)
    : env.DB.prepare(`SELECT ${rowColumns} FROM comments ORDER BY created_at DESC`);
  const result = await statement.all<CommentRow>();
  return json(request, env, { comments: result.results.map((row) => present(row, true)) });
}

async function updateManagedComment(request: Request, env: WorkerEnv, id: string): Promise<Response> {
  await requireManagementAccess(request, env);
  const body = await readJsonBody(request);
  if (!['open', 'resolved'].includes(String(body.status))) throw new HttpError(400, '无效批注状态');
  const row = await findComment(env, id);
  if (!row) throw new HttpError(404, '批注不存在');
  const status = body.status as CommentStatus;
  const now = new Date().toISOString();
  row.status = status;
  row.resolved_at = status === 'resolved' ? now : null;
  row.updated_at = now;
  await env.DB.prepare('UPDATE comments SET status = ?1, resolved_at = ?2, updated_at = ?3 WHERE id = ?4')
    .bind(row.status, row.resolved_at, row.updated_at, row.id).run();
  return json(request, env, { comment: present(row, true) });
}

async function deleteManagedComment(request: Request, env: WorkerEnv, id: string): Promise<Response> {
  await requireManagementAccess(request, env);
  const result = await env.DB.prepare('DELETE FROM comments WHERE id = ?1').bind(id).run();
  if (!result.meta.changes) throw new HttpError(404, '批注不存在');
  return json(request, env, { deleted: true });
}

async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method === 'OPTIONS') return preflight(request, env);
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') return json(request, env, { ok: true, storage: 'd1' });
  if (request.method === 'GET' && url.pathname === '/api/comments') return getComments(request, env, url);
  if (request.method === 'POST' && url.pathname === '/api/comments') return createComment(request, env);
  if (request.method === 'GET' && url.pathname === '/api/manage/comments') return listManagedComments(request, env, url);
  const ownMatch = url.pathname.match(/^\/api\/comments\/([^/]+)$/);
  if (ownMatch && request.method === 'PATCH') return updateOwnComment(request, env, ownMatch[1]);
  if (ownMatch && request.method === 'DELETE') return deleteOwnComment(request, env, ownMatch[1]);
  const managedMatch = url.pathname.match(/^\/api\/manage\/comments\/([^/]+)$/);
  if (managedMatch && request.method === 'PATCH') return updateManagedComment(request, env, managedMatch[1]);
  if (managedMatch && request.method === 'DELETE') return deleteManagedComment(request, env, managedMatch[1]);
  throw new HttpError(404, '接口不存在');
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof HttpError) return json(request, env, { error: error.message }, error.status);
      console.error(JSON.stringify({
        message: 'comment api request failed',
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : String(error)
      }));
      return json(request, env, { error: '批注服务暂不可用' }, 500);
    }
  }
} satisfies ExportedHandler<WorkerEnv>;
