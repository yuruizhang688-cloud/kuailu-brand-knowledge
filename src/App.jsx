import { useEffect, useMemo, useRef, useState } from 'react';
import MarkdownIt from 'markdown-it';
import JSZip from 'jszip';
import Manager from './Manager.jsx';
import CommentManager from './CommentManager.jsx';
import './styles.css';
import './brand.css';

const HOSTED_PREVIEW = import.meta.env.VITE_HOSTED_PREVIEW === '1';
const IS_LOCAL_HOST = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
const COMMENT_API_BASE = String(import.meta.env.VITE_COMMENTS_API_URL || '').trim().replace(/\/+$/, '');
const COMMENT_ADMIN_TOKEN = String(import.meta.env.VITE_COMMENTS_ADMIN_TOKEN || '').trim();
const USE_COMMENT_API = !HOSTED_PREVIEW || Boolean(COMMENT_API_BASE);
const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '');
const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
const json = (url) => fetch(`${BASE_PATH}/${url.replace(/^\//, '')}`, { cache: 'no-store' }).then(async (response) => {
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
});
const words = (value) => value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
const displayDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '未知';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replaceAll('/', '-');
};
const keyFor = (brand) => `brandbase:${brand}:drafts`;
const commentsKeyFor = (brand) => `brandbase:${brand}:comments`;
const commentApiUrl = (path) => `${COMMENT_API_BASE}${path}`;
const readLocalComments = (brand) => {
  try {
    const comments = JSON.parse(localStorage.getItem(commentsKeyFor(brand)) || '[]');
    return Array.isArray(comments) ? comments : [];
  } catch {
    return [];
  }
};
const writeLocalComments = (brand, comments) => localStorage.setItem(commentsKeyFor(brand), JSON.stringify(comments));
const presentLocalComment = ({ ownerKey, ...comment }, editKey) => ({ ...comment, canEdit: ownerKey === editKey });
const randomKey = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const slugify = (value) => value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'section';
const glyph = (symbol, className = '') => <span className={`glyph ${className}`}>{symbol}</span>;
const Search = ({ className }) => glyph('⌕', className); const Bold = () => glyph('B'); const Italic = () => glyph('I'); const UnderlineIcon = () => glyph('U');
const Strikethrough = () => glyph('S'); const Code2 = () => glyph('</>'); const Heading1 = () => glyph('H1'); const Heading2 = () => glyph('H2'); const Heading3 = () => glyph('H3');
const List = () => glyph('☷'); const ListOrdered = () => glyph('☷'); const Quote = () => glyph('❝'); const LinkIcon = () => glyph('↗'); const ImagePlus = () => glyph('▧');
const MessageSquarePlus = () => glyph('+'); const X = () => glyph('×');

function htmlToMarkdown(html) {
  const root = document.createElement('template'); root.innerHTML = html;
  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (!(node instanceof HTMLElement)) return '';
    const text = [...node.childNodes].map(visit).join(''); const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag.slice(1)))} ${text.trim()}\n\n`;
    if (tag === 'p') return `${text.trim()}\n\n`; if (tag === 'strong' || tag === 'b') return `**${text}**`; if (tag === 'em' || tag === 'i') return `*${text}*`;
    if (tag === 'u') return text; if (tag === 's' || tag === 'strike') return `~~${text}~~`; if (tag === 'code') return `\`${text}\``;
    if (tag === 'a') return `[${text || node.href}](${node.href})`; if (tag === 'img') return `![${node.alt || ''}](${node.src})`; if (tag === 'br') return '\n';
    if (tag === 'li') return `- ${text.trim()}\n`; if (tag === 'ul' || tag === 'ol') return `${text}\n`; if (tag === 'blockquote') return text.split('\n').filter(Boolean).map((line) => `> ${line}`).join('\n') + '\n\n';
    if (tag === 'pre') return `\`\`\`\n${node.textContent || ''}\n\`\`\`\n\n`; return text;
  };
  return [...root.content.childNodes].map(visit).join('').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function markdownHtml(markdown) {
  const used = new Map();
  const lineBreakToken = 'KUAILU_SAFE_LINE_BREAK_TOKEN';
  const renderableMarkdown = markdown.replace(/<br\s*\/?\s*>/gi, lineBreakToken);
  const fallback = md.renderer.rules.heading_open ?? ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));
  md.renderer.rules.heading_open = (tokens, index, options, env, self) => {
    const inline = tokens[index + 1];
    const base = slugify(inline?.content || 'section');
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    tokens[index].attrSet('id', count ? `${base}-${count + 1}` : base);
    return fallback(tokens, index, options, env, self);
  };
  const html = md.render(renderableMarkdown).replaceAll(lineBreakToken, '<br>');
  md.renderer.rules.heading_open = fallback;
  return html;
}

function route() {
  const pathname = BASE_PATH && location.pathname.startsWith(BASE_PATH) ? location.pathname.slice(BASE_PATH.length) : location.pathname;
  const pieces = pathname.split('/').filter(Boolean);
  const query = new URLSearchParams(location.search);
  const adminMode = query.has('admin') || [...query.values()].some((value) => value.toLocaleLowerCase() === 'admin');
  const manage = !HOSTED_PREVIEW && pieces[0] === 'manage';
  const comments = adminMode && pieces[0] === 'comments';
  const internalRoute = pieces[0] === 'manage' || pieces[0] === 'comments';
  const requestedBrandSlug = pieces[0] || '';
  const brandSlug = requestedBrandSlug === 'kuailu-v1' ? 'kuailu-v2' : requestedBrandSlug;
  return { manage, comments, adminMode, brandSlug: internalRoute ? '' : brandSlug, docId: query.get('doc'), edit: !HOSTED_PREVIEW && query.get('edit') === '1' };
}

function navigate({ brandSlug, docId, edit, adminMode = route().adminMode }, replace = false) {
  const query = new URLSearchParams();
  if (docId) query.set('doc', docId);
  if (edit) query.set('edit', '1');
  if (adminMode) query.set('mode', 'admin');
  history[replace ? 'replaceState' : 'pushState'](null, '', `${BASE_PATH}/${brandSlug}${query.size ? `?${query}` : ''}`);
  dispatchEvent(new PopStateEvent('popstate'));
}

function navigateComments() {
  history.pushState(null, '', `${BASE_PATH}/comments?mode=admin`);
  dispatchEvent(new PopStateEvent('popstate'));
}

function Tree({ nodes, active, expanded, setExpanded, select, depth = 0 }) {
  return nodes.map((node) => node.type === 'folder' ? (
    <section className="tree-folder" data-depth={depth} key={node.id}>
      <button className={`tree-item folder${expanded[node.id] ? ' open' : ''}`} data-depth={depth} title={node.label} aria-expanded={Boolean(expanded[node.id])} onClick={() => setExpanded((old) => ({ ...old, [node.id]: !old[node.id] }))}>
        <span className="chev" aria-hidden="true" />
        <span className="label">{node.label}</span><span className="meta">{node.count}</span>
      </button>
      {expanded[node.id] && <div className="tree-children"><Tree nodes={node.children} active={active} expanded={expanded} setExpanded={setExpanded} select={select} depth={depth + 1} /></div>}
    </section>
  ) : <button className={`tree-item file${active === node.id ? ' active' : ''}`} data-depth={depth} onClick={() => select(node.id)} key={node.id} title={node.title}>
    <span className="label">{node.label}</span>
  </button>);
}

function activeFolderPath(nodes, docId, ancestors = []) {
  for (const node of nodes) {
    if (node.type === 'file' && node.id === docId) return ancestors;
    if (node.type === 'folder') {
      const match = activeFolderPath(node.children, docId, [...ancestors, node.id]);
      if (match) return match;
    }
  }
  return null;
}

function EditorToolbar({ surfaceRef }) {
  const command = (name, value) => { surfaceRef.current?.focus(); document.execCommand(name, false, value); };
  const Tool = ({ title, children, action }) => <button type="button" className="toolbar-btn" title={title} aria-label={title} onClick={action}>{children}</button>;
  return <div className="editor-toolbar">
    <div className="editor-toolbar__group">
      <Tool title="一级标题" action={() => command('formatBlock', 'h1')}><Heading1 /></Tool>
      <Tool title="二级标题" action={() => command('formatBlock', 'h2')}><Heading2 /></Tool>
      <Tool title="三级标题" action={() => command('formatBlock', 'h3')}><Heading3 /></Tool>
    </div><span className="editor-toolbar__sep" />
    <div className="editor-toolbar__group">
      <Tool title="加粗" action={() => command('bold')}><Bold /></Tool><Tool title="斜体" action={() => command('italic')}><Italic /></Tool><Tool title="下划线" action={() => command('underline')}><UnderlineIcon /></Tool><Tool title="删除线" action={() => command('strikeThrough')}><Strikethrough /></Tool><Tool title="行内代码" action={() => command('formatBlock', 'pre')}><Code2 /></Tool>
    </div><span className="editor-toolbar__sep" />
    <div className="editor-toolbar__group">
      <Tool title="无序列表" action={() => command('insertUnorderedList')}><List /></Tool><Tool title="有序列表" action={() => command('insertOrderedList')}><ListOrdered /></Tool><Tool title="引用" action={() => command('formatBlock', 'blockquote')}><Quote /></Tool>
      <Tool title="链接" action={() => { const href = window.prompt('链接地址', 'https://'); if (href?.trim()) command('createLink', href); }}><LinkIcon /></Tool>
      <Tool title="图片" action={() => { const src = window.prompt('图片地址', 'https://'); if (src?.trim()) command('insertImage', src); }}><ImagePlus /></Tool>
    </div>
  </div>;
}

function VisualEditor({ initialHtml, resetKey, doc, onSave, onDiscard, onExport, onExit }) {
  const [status, setStatus] = useState('本机无修改'); const [dirty, setDirty] = useState(false); const surfaceRef = useRef(null);
  useEffect(() => { if (surfaceRef.current) surfaceRef.current.innerHTML = initialHtml; setDirty(false); setStatus('本机无修改'); }, [resetKey, initialHtml]);
  useEffect(() => {
    if (!dirty || !surfaceRef.current) return undefined;
    const timer = setTimeout(() => { onSave(htmlToMarkdown(surfaceRef.current.innerHTML)); setDirty(false); setStatus('已保存到本机'); }, 1000);
    return () => clearTimeout(timer);
  }, [dirty, onSave]);
  return <section className="visual-editor" aria-label="所见即所得编辑器">
    <div className="visual-editor__bar"><div className="visual-editor__meta"><span className="visual-editor__badge">编辑模式</span><span>{doc.relativePath}</span></div>
      <div className="visual-editor__actions"><span className={`visual-editor__status${status.includes('已') ? ' saved' : ''}`}>{status}</span><button onClick={onExit}>退出编辑</button><button onClick={onDiscard} disabled={!dirty}>丢弃</button><button onClick={onExport}>导出知识库</button></div>
    </div>
    <EditorToolbar surfaceRef={surfaceRef} />
    <div className="tiptap-editor"><div ref={surfaceRef} className="article blog-html-content visual-editor__surface" contentEditable suppressContentEditableWarning onInput={() => { setDirty(true); setStatus('有未保存修改'); }} /></div>
  </section>;
}

function CommentPanel({ open, onClose, brand, doc, editKey, target, useCommentApi }) {
  const [comments, setComments] = useState([]); const [authorName, setAuthorName] = useState(() => localStorage.getItem('brandbase:reviewer-name') || '');
  const [body, setBody] = useState(''); const [message, setMessage] = useState(''); const [editing, setEditing] = useState(null); const [submitting, setSubmitting] = useState(false);
  async function load() {
    if (!brand || !doc) return;
    setMessage('');
    if (!useCommentApi) {
      const localComments = readLocalComments(brand.slug)
        .filter((item) => item.docId === doc.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((item) => presentLocalComment(item, editKey));
      setComments(localComments);
      return;
    }
    try {
      const params = new URLSearchParams({ brandSlug: brand.slug, docId: doc.id, editKey });
      const response = await fetch(commentApiUrl(`/api/comments?${params}`));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '批注加载失败');
      setComments(data.comments || []);
    } catch (reason) {
      setComments([]);
      setMessage(`批注服务不可访问：${reason.message}`);
    }
  }
  useEffect(() => {
    if (!open) return;
    setBody(''); setEditing(null); setMessage(''); load();
  }, [open, brand?.slug, doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function submit(event) {
    event.preventDefault(); if (!authorName.trim() || !body.trim()) return;
    localStorage.setItem('brandbase:reviewer-name', authorName.trim());
    setSubmitting(true); setMessage('');
    try {
      if (!useCommentApi) {
        const stored = readLocalComments(brand.slug);
        if (editing) {
          const index = stored.findIndex((item) => item.id === editing.id && item.ownerKey === editKey);
          if (index < 0) throw new Error('没有修改该批注的权限');
          stored[index] = { ...stored[index], comment: body.trim(), updatedAt: new Date().toISOString() };
          writeLocalComments(brand.slug, stored);
          setComments((old) => old.map((item) => item.id === editing.id ? presentLocalComment(stored[index], editKey) : item));
        } else {
          const now = new Date().toISOString();
          const comment = {
            id: randomKey(), brandSlug: brand.slug, docId: doc.id, relativePath: doc.relativePath,
            docTitle: doc.title, targetKind: target?.kind || 'document', status: 'open', resolvedAt: null,
            authorName: authorName.trim(), comment: body.trim(), suggestedText: '', selectedText: target?.text || '',
            contextBefore: '', contextAfter: '', headingText: target?.heading || doc.title, anchorId: target?.anchorId || '',
            createdAt: now, updatedAt: now, ownerKey: editKey
          };
          stored.push(comment); writeLocalComments(brand.slug, stored);
          setComments((old) => [presentLocalComment(comment, editKey), ...old]);
        }
        setBody(''); setEditing(null); setMessage('已保存到当前浏览器');
        return;
      }
      const payload = { comment: body.trim(), suggestedText: '', website: '', editKey };
      const response = editing
        ? await fetch(commentApiUrl(`/api/comments/${editing.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch(commentApiUrl('/api/comments'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandSlug: brand.slug, docId: doc.id, relativePath: doc.relativePath, docTitle: doc.title, targetKind: target?.kind || 'document', authorName: authorName.trim(), ...payload, selectedText: target?.text || '', contextBefore: '', contextAfter: '', headingText: target?.heading || doc.title, anchorId: target?.anchorId || '' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '提交失败');
      setComments((old) => editing ? old.map((item) => item.id === data.comment.id ? data.comment : item) : [data.comment, ...old]);
      setBody(''); setEditing(null); setMessage(editing ? '已保存修改' : '已提交批注');
    } catch (reason) {
      setMessage(reason.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  }
  async function remove(comment) {
    if (!window.confirm('确定删除这条批注吗？')) return;
    setMessage('');
    try {
      if (!useCommentApi) {
        const stored = readLocalComments(brand.slug);
        const owned = stored.find((item) => item.id === comment.id && item.ownerKey === editKey);
        if (!owned) throw new Error('没有删除该批注的权限');
        writeLocalComments(brand.slug, stored.filter((item) => item.id !== comment.id));
      } else {
        const response = await fetch(commentApiUrl(`/api/comments/${comment.id}`), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editKey }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '删除失败');
      }
      setComments((old) => old.filter((item) => item.id !== comment.id));
      if (editing?.id === comment.id) { setEditing(null); setBody(''); }
      setMessage('批注已删除');
    } catch (reason) { setMessage(reason.message || '删除失败'); }
  }
  if (!open) return null;
  const targetLabel = target?.kind === 'row' ? '当前行' : target?.kind === 'block' ? '当前段落' : '当前知识点';
  return <aside className="comment-panel"><header className="comment-panel__header"><div className="comment-panel__head-copy"><div className="comment-panel__title"><span>批注</span><span className="dot">·</span><span className="reviewer-name">{authorName ? `批注人：${authorName}` : '批注人'}</span></div><div className="comment-panel__subtitle">{comments.length ? `${comments.length} 条本知识点批注` : '本知识点暂无批注'}</div><div className="comment-panel__storage">{useCommentApi ? '团队在线同步' : '保存在当前浏览器'}</div></div><button className="icon-btn" onClick={onClose} aria-label="关闭批注"><X size={16} /></button></header>
    <form className="comment-composer" onSubmit={submit}><label className="comment-field"><span>批注人</span><input value={authorName} maxLength="80" onChange={(event) => setAuthorName(event.target.value)} placeholder="请输入姓名" required /></label><div className="comment-composer__target"><span>{targetLabel}</span><blockquote>{target?.text || target?.heading || doc.title}</blockquote></div><label className="comment-field"><span>批注内容</span><textarea value={body} maxLength="3000" rows="5" onChange={(event) => setBody(event.target.value)} placeholder="请写下需要确认或纠正的问题，或直接写建议内容" required /></label>{message && <div className="comment-submit-message" role="status">{message}</div>}<div className="comment-composer__actions"><button type="button" onClick={() => { setBody(''); setEditing(null); setMessage(''); }}>取消</button><button type="submit" className="primary" disabled={submitting}>{submitting ? '正在保存…' : (editing ? '保存修改' : '确认')}</button></div></form>
    <div className="comment-list">{comments.length ? comments.map((comment) => <article className={`comment-item${comment.status === 'resolved' ? ' resolved' : ''}`} key={comment.id}><div className="comment-item__meta"><strong>{comment.authorName}</strong><span className={`comment-status${comment.status === 'resolved' ? ' resolved' : ''}`}>{comment.status === 'resolved' ? '已解决' : '待处理'}</span><span>{new Date(comment.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>{comment.selectedText ? <blockquote className="comment-item__quote">{comment.selectedText}</blockquote> : <div className="comment-item__scope">当前内容</div>}<p>{comment.comment}</p>{comment.canEdit && <div className="comment-item__actions"><button onClick={() => { setEditing(comment); setBody(comment.comment); setMessage(''); }}>修改</button><button className="danger" onClick={() => remove(comment)}>删除</button></div>}</article>) : <div className="comment-empty">暂无批注</div>}</div>
  </aside>;
}

export default function App() {
  const [currentRoute, setCurrentRoute] = useState(route); const [site, setSite] = useState(null); const [brand, setBrand] = useState(null); const [docData, setDocData] = useState(null); const [expanded, setExpanded] = useState({});
  const [query, setQuery] = useState(''); const [searchEntries, setSearchEntries] = useState([]); const [drafts, setDrafts] = useState({}); const [error, setError] = useState(''); const [commentOpen, setCommentOpen] = useState(false); const [commentTarget, setCommentTarget] = useState(null); const [commentButton, setCommentButton] = useState(null); const [exporting, setExporting] = useState(false); const [actionMessage, setActionMessage] = useState(''); const articleRef = useRef(null); const searchRef = useRef(null);
  const expandedBrandRef = useRef('');
  const [editKey] = useState(() => { const old = localStorage.getItem('brandbase:reviewer-edit-key'); if (old) return old; const next = randomKey(); localStorage.setItem('brandbase:reviewer-edit-key', next); return next; });
  useEffect(() => { const listener = () => setCurrentRoute(route()); addEventListener('popstate', listener); return () => removeEventListener('popstate', listener); }, []);
  useEffect(() => { const listener = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); } }; addEventListener('keydown', listener); return () => removeEventListener('keydown', listener); }, []);
  useEffect(() => { json('kb/manifest.json').then(setSite).catch((reason) => setError(`无法加载索引：${reason.message}`)); }, []);
  useEffect(() => { if (currentRoute.manage || currentRoute.comments) return; const selected = site?.brands.find((item) => item.slug === (currentRoute.brandSlug || site.defaultBrand)); if (!selected) return; json(selected.manifestUrl).then((data) => { setBrand(data); setDrafts(JSON.parse(localStorage.getItem(keyFor(data.slug)) || '{}')); if (!currentRoute.brandSlug) navigate({ brandSlug: data.slug, docId: data.defaultDocId, edit: false }, true); }).catch((reason) => setError(`无法加载知识库：${reason.message}`)); }, [site, currentRoute.brandSlug, currentRoute.manage, currentRoute.comments]);
  const activeDoc = brand?.docs.find((item) => item.id === currentRoute.docId) || brand?.docs.find((item) => item.id === brand?.defaultDocId);
  useEffect(() => {
    if (!brand?.tree || !activeDoc?.id) return;
    const path = activeFolderPath(brand.tree, activeDoc.id) || [];
    const pathState = Object.fromEntries(path.map((id) => [id, true]));
    if (expandedBrandRef.current !== brand.slug) {
      expandedBrandRef.current = brand.slug;
      setExpanded(pathState);
      return;
    }
    setExpanded((old) => ({ ...old, ...pathState }));
  }, [brand?.slug, activeDoc?.id]);
  useEffect(() => { if (activeDoc) json(activeDoc.contentUrl).then(setDocData).catch((reason) => setError(`无法加载文档：${reason.message}`)); }, [activeDoc?.id]);
  useEffect(() => { if (!brand || !query.trim()) return setSearchEntries([]); Promise.all(brand.searchChunks.map((chunk) => json(chunk.url))).then((chunks) => setSearchEntries(chunks.flatMap((chunk) => chunk.entries))).catch(() => setSearchEntries([])); }, [brand?.slug, query]);
  const results = useMemo(() => { const terms = words(query); if (!terms.length) return []; return searchEntries.filter((entry) => terms.every((term) => `${entry.title} ${entry.relativePath} ${entry.text}`.toLocaleLowerCase().includes(term))).slice(0, 60); }, [query, searchEntries]);
  const markdown = drafts[activeDoc?.id] ?? docData?.markdown ?? ''; const rendered = useMemo(() => markdownHtml(markdown), [markdown]);
  const toc = useMemo(() => [...rendered.matchAll(/<h([23]) id="([^"]+)">([^<]+)<\/h\1>/g)].map((match) => ({ depth: Number(match[1]), id: match[2], text: match[3] })), [rendered]);
  const docIndex = brand?.docs.findIndex((item) => item.id === activeDoc?.id) ?? -1; const previous = docIndex > 0 ? brand.docs[docIndex - 1] : null; const next = docIndex >= 0 && docIndex < (brand?.docs.length ?? 0) - 1 ? brand.docs[docIndex + 1] : null;
  function select(docId) { setCommentOpen(false); setCommentTarget(null); setCommentButton(null); navigate({ brandSlug: brand.slug, docId, edit: currentRoute.edit }); }
  function saveDraft(nextMarkdown) { const nextDrafts = { ...drafts, [activeDoc.id]: nextMarkdown }; setDrafts(nextDrafts); localStorage.setItem(keyFor(brand.slug), JSON.stringify(nextDrafts)); }
  function discardDraft() { const nextDrafts = { ...drafts }; delete nextDrafts[activeDoc.id]; setDrafts(nextDrafts); localStorage.setItem(keyFor(brand.slug), JSON.stringify(nextDrafts)); }
  async function exportAll() {
    if (!brand || exporting) return;
    setExporting(true); setActionMessage('');
    try {
      const exported = brand.exportUrl ? await json(brand.exportUrl) : null;
      const contents = exported?.docs ?? await Promise.all(brand.docs.map(async (doc) => ({ id: doc.id, relativePath: doc.relativePath, markdown: (await json(doc.contentUrl)).markdown })));
      const zip = new JSZip();
      for (const doc of contents) zip.file(doc.relativePath, drafts[doc.id] ?? doc.markdown);
      const blob = await zip.generateAsync({ type: 'blob' });
      const objectUrl = URL.createObjectURL(blob);
      const date = displayDate(new Date());
      const safeName = String(brand.shortName || brand.displayName || brand.slug).replace(/[\\/:*?"<>|]/g, '-');
      const link = Object.assign(document.createElement('a'), { href: objectUrl, download: `${safeName}-Markdown-${date}.zip` });
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setActionMessage(`已导出 ${contents.length} 个 Markdown 文件`);
    } catch (reason) {
      setActionMessage(`导出失败：${reason.message}`);
    } finally {
      setExporting(false);
    }
  }
  function showComment(event) {
    const article = articleRef.current;
    const selector = 'tbody tr,h1,h2,h3,h4,p,li,blockquote,pre';
    const block = event.target.closest(selector);
    if (!block || !article?.contains(block)) return;
    const isRow = block.matches('tbody tr');
    const selection = window.getSelection()?.toString().trim();
    const rowText = isRow ? [...block.cells].map((cell) => cell.textContent?.trim()).filter(Boolean).join(' ｜ ') : '';
    const text = selection || rowText || block.textContent?.trim() || activeDoc.title;
    const blocks = [...article.querySelectorAll(selector)];
    const blockIndex = blocks.indexOf(block);
    const headings = [...article.querySelectorAll('h1,h2,h3,h4')];
    const precedingHeading = headings.filter((heading) => heading === block || Boolean(heading.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    const kind = isRow ? 'row' : 'block';
    const rect = block.getBoundingClientRect();
    setCommentTarget({ kind, text: text.slice(0, 1200), heading: precedingHeading?.textContent?.trim() || activeDoc.title, anchorId: `${activeDoc.id}:${kind}:${blockIndex}` });
    setCommentButton({ x: Math.min(window.innerWidth - (isRow ? 128 : 110), rect.right + 10), y: Math.max(60, rect.top) });
  }
  if (currentRoute.manage) return <Manager />;
  if (currentRoute.comments) return site ? <CommentManager apiBase={COMMENT_API_BASE} adminToken={COMMENT_ADMIN_TOKEN} requireAdminKey={IS_LOCAL_HOST} brandSlug={site.defaultBrand} basePath={BASE_PATH} onBack={() => navigate({ brandSlug: site.defaultBrand, docId: null, edit: false })} onOpenComment={(comment) => navigate({ brandSlug: comment.brandSlug || site.defaultBrand, docId: comment.docId, edit: false })} /> : <main className="loading">加载批注管理…</main>;
  if (error) return <main className="error">{error}</main>; if (!brand || !activeDoc) return <main className="loading">加载品牌知识库…</main>;
  return <div className="kb-shell">
    <div className="app"><aside className="sidebar"><div className="sidebar-header"><div className="logo-copy"><div className="sidebar-eyebrow">KUAILU KNOWLEDGE</div><div className="logo-text">快鹭品牌知识库</div><div className="logo-sub">{brand.knowledgePointCount} 个知识点</div></div></div><label className="search-box"><Search size={13} className="search-icon" /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识库内容…" /><span className="kbd">⌘K</span></label><div className="sidebar-section-label">内容目录</div>{query.trim() ? <div className="search-results"><div className="search-status">{searchEntries.length ? '全文索引已就绪' : '正在加载全文索引'}</div><div className="result-list">{results.map((result) => <button className="result-item" key={result.id} onClick={() => select(result.id)}><span className="result-title">{result.title}</span><span className="result-path">{result.breadcrumbs.join(' / ')}</span><span className="result-snippet">{result.text}</span></button>)}{!results.length && <div className="empty-search">没有找到「{query}」</div>}</div></div> : <nav className="tree"><Tree nodes={brand.tree} active={activeDoc.id} expanded={expanded} setExpanded={setExpanded} select={select} /></nav>}</aside>
      <main className={`main${commentOpen ? ' comments-open' : ''}`}><div className="topbar"><div className="breadcrumbs">{activeDoc.breadcrumbs.map((crumb, index) => <span className="crumb-part" key={`${crumb}-${index}`}>{index > 0 && <span className="sep">/</span>}<span className={`crumb${index === activeDoc.breadcrumbs.length - 1 ? ' current' : ''}`}>{crumb}</span></span>)}</div><div className="topbar-actions">{actionMessage && <span className="topbar-status" role="status" title={actionMessage}>{actionMessage}</span>}{currentRoute.adminMode && !currentRoute.edit && <button type="button" className="topbar-action" onClick={navigateComments}>批注管理</button>}{!currentRoute.edit && <button type="button" className="topbar-action" onClick={() => { setCommentTarget({ kind: 'document', text: '', heading: activeDoc.title, anchorId: `${activeDoc.id}:document` }); setCommentButton(null); setCommentOpen(true); }}>批注</button>}<button type="button" className="topbar-action topbar-action--primary" title="导出 Markdown 知识库" onClick={exportAll} disabled={exporting}>{exporting ? '导出中…' : '导出'}</button></div></div><div className="content-wrap"><div className="content-card">{currentRoute.edit ? <VisualEditor initialHtml={rendered} resetKey={`${activeDoc.id}:${markdown.length}`} doc={activeDoc} onSave={saveDraft} onDiscard={discardDraft} onExport={exportAll} onExit={() => navigate({ brandSlug: brand.slug, docId: activeDoc.id, edit: false })} /> : <><div className="article-kicker"><span>KNOWLEDGE DOCUMENT</span><i>已收录</i></div><article ref={articleRef} className="article blog-html-content" dangerouslySetInnerHTML={{ __html: rendered }} onMouseOver={showComment} onMouseUp={showComment} /><div className="doc-meta-footer"><span>{activeDoc.relativePath}</span><span>更新时间：{displayDate(activeDoc.updatedAt)}</span></div><div className="doc-footer">{previous ? <button onClick={() => select(previous.id)}><span className="lbl">← 上一篇</span><span className="title">{previous.title}</span></button> : <span />}{next ? <button className="next" onClick={() => select(next.id)}><span className="lbl">下一篇 →</span><span className="title">{next.title}</span></button> : <span />}</div></>}</div></div>{!currentRoute.edit && commentButton && <button className="block-comment-button" style={{ left: commentButton.x, top: commentButton.y }} onClick={() => { setCommentOpen(true); setCommentButton(null); }}><MessageSquarePlus size={13} />批注</button>}{toc.length > 0 && !currentRoute.edit && <nav className="toc"><div className="toc-label">本页目录</div>{toc.map((item) => <button key={item.id} className={item.depth === 3 ? 'depth-3' : ''} onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{item.text}</button>)}</nav>}<CommentPanel open={commentOpen} onClose={() => setCommentOpen(false)} brand={brand} doc={activeDoc} editKey={editKey} target={commentTarget} useCommentApi={USE_COMMENT_API} /></main>
    </div>
  </div>;
}
