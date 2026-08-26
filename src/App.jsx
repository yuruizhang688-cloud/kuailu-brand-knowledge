import { useEffect, useMemo, useRef, useState } from 'react';
import MarkdownIt from 'markdown-it';
import JSZip from 'jszip';
import Manager from './Manager.jsx';
import './styles.css';
import './brand.css';

const HOSTED_PREVIEW = import.meta.env.VITE_HOSTED_PREVIEW === '1';
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
  const manage = !HOSTED_PREVIEW && pieces[0] === 'manage';
  const requestedBrandSlug = pieces[0] || '';
  const brandSlug = requestedBrandSlug === 'kuailu-v1' ? 'kuailu-v2' : requestedBrandSlug;
  return { manage, brandSlug: manage ? '' : (pieces[0] === 'manage' ? '' : brandSlug), docId: query.get('doc'), edit: !HOSTED_PREVIEW && query.get('edit') === '1' };
}

function navigate({ brandSlug, docId, edit }, replace = false) {
  const query = new URLSearchParams();
  if (docId) query.set('doc', docId);
  if (edit) query.set('edit', '1');
  history[replace ? 'replaceState' : 'pushState'](null, '', `${BASE_PATH}/${brandSlug}${query.size ? `?${query}` : ''}`);
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

function CommentPanel({ open, onClose, brand, doc, editKey, target }) {
  const [comments, setComments] = useState([]); const [authorName, setAuthorName] = useState(() => localStorage.getItem('brandbase:reviewer-name') || '');
  const [body, setBody] = useState(''); const [message, setMessage] = useState(''); const [editing, setEditing] = useState(null);
  async function load() { if (!brand || !doc) return; try { const params = new URLSearchParams({ brandSlug: brand.slug, docId: doc.id, editKey }); const response = await fetch(`/api/comments?${params}`); const data = await response.json(); setComments(data.comments || []); } catch { setMessage('批注服务未启动或不可访问。'); } }
  useEffect(() => { if (open) load(); }, [open, brand?.slug, doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function submit(event) {
    event.preventDefault(); if (!authorName.trim() || !body.trim()) return;
    localStorage.setItem('brandbase:reviewer-name', authorName.trim());
    const payload = { comment: body, suggestedText: '', website: '', editKey };
    const response = editing ? await fetch(`/api/comments/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) : await fetch('/api/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandSlug: brand.slug, docId: doc.id, relativePath: doc.relativePath, authorName, ...payload, selectedText: target?.text || '', contextBefore: '', contextAfter: '', headingText: target?.heading || doc.title, anchorId: target?.anchorId || '' }) });
    const data = await response.json(); if (!response.ok) return setMessage(data.error || '提交失败');
    setComments((old) => editing ? old.map((item) => item.id === data.comment.id ? data.comment : item) : [data.comment, ...old]); setBody(''); setEditing(null); setMessage(editing ? '已保存' : '已提交');
  }
  if (!open) return null;
  return <aside className="comment-panel"><header className="comment-panel__header"><div className="comment-panel__head-copy"><div className="comment-panel__title"><span>批注</span><span className="dot">·</span><span className="reviewer-name">{authorName ? `批注人：${authorName}` : '批注人'}</span></div>{comments.length ? <div className="comment-panel__subtitle">{comments.length} 条当前内容批注</div> : null}</div><button className="icon-btn" onClick={onClose} aria-label="关闭批注"><X size={16} /></button></header>
    <form className="comment-composer" onSubmit={submit}><label className="comment-field"><span>批注人</span><input value={authorName} maxLength="80" onChange={(event) => setAuthorName(event.target.value)} placeholder="请输入姓名" required /></label><div className="comment-composer__target"><span>当前内容</span><blockquote>{target?.text || target?.heading || doc.title}</blockquote></div><label className="comment-field"><span>批注内容</span><textarea value={body} maxLength="3000" rows="5" onChange={(event) => setBody(event.target.value)} placeholder="请写下需要确认或纠正的问题，或直接写建议内容" required /></label>{message && <div className="comment-submit-message">{message}</div>}<div className="comment-composer__actions"><button type="button" onClick={() => { setBody(''); setEditing(null); }}>取消</button><button className="primary">{editing ? '保存修改' : '确认'}</button></div></form>
    <div className="comment-list">{comments.length ? comments.map((comment) => <article className="comment-item" key={comment.id}><div className="comment-item__meta"><strong>{comment.authorName}</strong><span>{new Date(comment.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>{comment.selectedText ? <blockquote className="comment-item__quote">{comment.selectedText}</blockquote> : <div className="comment-item__scope">当前内容</div>}<p>{comment.comment}</p>{comment.canEdit && <div className="comment-item__actions"><button onClick={() => { setEditing(comment); setBody(comment.comment); }}>修改</button></div>}</article>) : <div className="comment-empty">暂无批注</div>}</div>
  </aside>;
}

export default function App() {
  const [currentRoute, setCurrentRoute] = useState(route); const [site, setSite] = useState(null); const [brand, setBrand] = useState(null); const [docData, setDocData] = useState(null); const [expanded, setExpanded] = useState({});
  const [query, setQuery] = useState(''); const [searchEntries, setSearchEntries] = useState([]); const [drafts, setDrafts] = useState({}); const [error, setError] = useState(''); const [commentOpen, setCommentOpen] = useState(false); const [commentTarget, setCommentTarget] = useState(null); const [commentButton, setCommentButton] = useState(null); const articleRef = useRef(null); const searchRef = useRef(null);
  const expandedBrandRef = useRef('');
  const [editKey] = useState(() => { if (HOSTED_PREVIEW) return ''; const old = localStorage.getItem('brandbase:reviewer-edit-key'); if (old) return old; const next = randomKey(); localStorage.setItem('brandbase:reviewer-edit-key', next); return next; });
  useEffect(() => { const listener = () => setCurrentRoute(route()); addEventListener('popstate', listener); return () => removeEventListener('popstate', listener); }, []);
  useEffect(() => { const listener = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); } }; addEventListener('keydown', listener); return () => removeEventListener('keydown', listener); }, []);
  useEffect(() => { json('kb/manifest.json').then(setSite).catch((reason) => setError(`无法加载索引：${reason.message}`)); }, []);
  useEffect(() => { if (currentRoute.manage) return; const selected = site?.brands.find((item) => item.slug === (currentRoute.brandSlug || site.defaultBrand)); if (!selected) return; json(selected.manifestUrl).then((data) => { setBrand(data); setDrafts(JSON.parse(localStorage.getItem(keyFor(data.slug)) || '{}')); if (!currentRoute.brandSlug) navigate({ brandSlug: data.slug, docId: data.defaultDocId, edit: false }, true); }).catch((reason) => setError(`无法加载知识库：${reason.message}`)); }, [site, currentRoute.brandSlug, currentRoute.manage]);
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
  function select(docId) { navigate({ brandSlug: brand.slug, docId, edit: currentRoute.edit }); }
  function saveDraft(nextMarkdown) { const nextDrafts = { ...drafts, [activeDoc.id]: nextMarkdown }; setDrafts(nextDrafts); localStorage.setItem(keyFor(brand.slug), JSON.stringify(nextDrafts)); }
  function discardDraft() { const nextDrafts = { ...drafts }; delete nextDrafts[activeDoc.id]; setDrafts(nextDrafts); localStorage.setItem(keyFor(brand.slug), JSON.stringify(nextDrafts)); }
  async function exportAll() { const zip = new JSZip(); const contents = await Promise.all(brand.docs.map(async (doc) => ({ doc, data: await json(doc.contentUrl) }))); for (const { doc, data } of contents) zip.file(doc.relativePath, drafts[doc.id] ?? data.markdown); const blob = await zip.generateAsync({ type: 'blob' }); const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `brandbase-${brand.slug}-kb.zip` }); link.click(); URL.revokeObjectURL(link.href); }
  function showComment(event) { if (HOSTED_PREVIEW) return; const selection = window.getSelection()?.toString().trim(); const block = event.target.closest('h1,h2,h3,h4,p,li,blockquote,table,pre'); if (!block || !articleRef.current?.contains(block)) return; const rect = block.getBoundingClientRect(); const text = selection || block.textContent?.trim() || activeDoc.title; setCommentTarget({ text: text.slice(0, 1200), heading: activeDoc.title, anchorId: `${activeDoc.id}:block` }); setCommentButton({ x: Math.min(window.innerWidth - 110, rect.right + 10), y: Math.max(60, rect.top) }); }
  if (currentRoute.manage) return <Manager />;
  if (error) return <main className="error">{error}</main>; if (!brand || !activeDoc) return <main className="loading">加载品牌知识库…</main>;
  return <div className="kb-shell">
    <div className="app"><aside className="sidebar"><div className="sidebar-header"><div className="logo-copy"><div className="sidebar-eyebrow">KUAILU KNOWLEDGE</div><div className="logo-text">快鹭品牌知识库</div><div className="logo-sub">{brand.knowledgePointCount} 个知识点</div></div></div><label className="search-box"><Search size={13} className="search-icon" /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识库内容…" /><span className="kbd">⌘K</span></label><div className="sidebar-section-label">内容目录</div>{query.trim() ? <div className="search-results"><div className="search-status">{searchEntries.length ? '全文索引已就绪' : '正在加载全文索引'}</div><div className="result-list">{results.map((result) => <button className="result-item" key={result.id} onClick={() => select(result.id)}><span className="result-title">{result.title}</span><span className="result-path">{result.breadcrumbs.join(' / ')}</span><span className="result-snippet">{result.text}</span></button>)}{!results.length && <div className="empty-search">没有找到「{query}」</div>}</div></div> : <nav className="tree"><Tree nodes={brand.tree} active={activeDoc.id} expanded={expanded} setExpanded={setExpanded} select={select} /></nav>}</aside>
      <main className={`main${commentOpen ? ' comments-open' : ''}`}><div className="topbar"><div className="breadcrumbs">{activeDoc.breadcrumbs.map((crumb, index) => <span className="crumb-part" key={`${crumb}-${index}`}>{index > 0 && <span className="sep">/</span>}<span className={`crumb${index === activeDoc.breadcrumbs.length - 1 ? ' current' : ''}`}>{crumb}</span></span>)}</div></div><div className="content-wrap"><div className="content-card">{currentRoute.edit ? <VisualEditor initialHtml={rendered} resetKey={`${activeDoc.id}:${markdown.length}`} doc={activeDoc} onSave={saveDraft} onDiscard={discardDraft} onExport={exportAll} onExit={() => navigate({ brandSlug: brand.slug, docId: activeDoc.id, edit: false })} /> : <><div className="article-kicker"><span>KNOWLEDGE DOCUMENT</span><i>已收录</i></div><article ref={articleRef} className="article blog-html-content" dangerouslySetInnerHTML={{ __html: rendered }} onMouseMove={showComment} onMouseUp={showComment} /><div className="doc-meta-footer"><span>{activeDoc.relativePath}</span><span>更新时间：{displayDate(activeDoc.updatedAt)}</span></div><div className="doc-footer">{previous ? <button onClick={() => select(previous.id)}><span className="lbl">← 上一篇</span><span className="title">{previous.title}</span></button> : <span />}{next ? <button className="next" onClick={() => select(next.id)}><span className="lbl">下一篇 →</span><span className="title">{next.title}</span></button> : <span />}</div></>}</div></div>{!HOSTED_PREVIEW && !currentRoute.edit && commentButton && <button className="block-comment-button" style={{ left: commentButton.x, top: commentButton.y }} onClick={() => { setCommentOpen(true); setCommentButton(null); }}><MessageSquarePlus size={13} />批注</button>}{toc.length > 0 && !currentRoute.edit && <nav className="toc"><div className="toc-label">本页目录</div>{toc.map((item) => <button key={item.id} className={item.depth === 3 ? 'depth-3' : ''} onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{item.text}</button>)}</nav>}{!HOSTED_PREVIEW && <CommentPanel open={commentOpen} onClose={() => setCommentOpen(false)} brand={brand} doc={activeDoc} editKey={editKey} target={commentTarget} />}</main>
    </div>
  </div>;
}
