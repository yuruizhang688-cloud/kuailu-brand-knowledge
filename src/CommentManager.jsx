import { useEffect, useMemo, useState } from 'react';
import './comment-manager.css';

const statusLabel = (status) => status === 'resolved' ? '已解决' : '待处理';
const targetLabel = (comment) => {
  const kind = comment.targetKind || (comment.anchorId?.includes(':row:') ? 'row' : comment.anchorId?.includes(':block:') ? 'block' : 'document');
  return kind === 'row' ? '信息行' : kind === 'block' ? '正文段落' : '整个知识点';
};
const cleanOrder = (value) => String(value || '').replace(/^\d+[-_. ]*/, '');
const docTitle = (comment) => comment.docTitle || cleanOrder(comment.relativePath?.split('/').at(-1)?.replace(/\.md$/i, '')) || '未命名知识点';
const moduleName = (comment) => cleanOrder(comment.relativePath?.split('/')[0]) || '未分类';
const displayTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '未知';
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
};
const quoteMarkdown = (value) => String(value || '未记录原文').split('\n').map((line) => `> ${line}`).join('\n');
const escapeInline = (value) => String(value || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();

function downloadMarkdown(comments, filterDescription, brandSlug, basePath) {
  const statuses = ['open', 'resolved'];
  const lines = [
    '# 快鹭知识库批注记录', '',
    `- 导出时间：${displayTime(new Date())}`,
    `- 批注数量：${comments.length}`,
    `- 筛选范围：${filterDescription}`, ''
  ];
  for (const status of statuses) {
    const statusComments = comments.filter((comment) => (comment.status === 'resolved' ? 'resolved' : 'open') === status);
    if (!statusComments.length) continue;
    lines.push(`## ${statusLabel(status)}`, '');
    const modules = [...new Set(statusComments.map(moduleName))];
    for (const module of modules) {
      lines.push(`### ${module}`, '');
      const moduleComments = statusComments.filter((comment) => moduleName(comment) === module);
      const documents = [...new Set(moduleComments.map((comment) => `${comment.docId}\0${comment.relativePath}`))];
      for (const documentKey of documents) {
        const documentComments = moduleComments.filter((comment) => `${comment.docId}\0${comment.relativePath}` === documentKey);
        const first = documentComments[0];
        lines.push(`#### ${docTitle(first)}`, '');
        documentComments.forEach((comment, index) => {
          const pageUrl = `${location.origin}${basePath}/${brandSlug}?doc=${encodeURIComponent(comment.docId)}`;
          lines.push(
            `##### 批注 ${index + 1}`, '',
            `- 文件路径：${escapeInline(comment.relativePath)}`,
            `- 页面链接：[查看原文](${pageUrl})`,
            `- 批注位置：${targetLabel(comment)}${comment.headingText ? ` / ${escapeInline(comment.headingText)}` : ''}`,
            `- 批注人：${escapeInline(comment.authorName)}`,
            `- 状态：${statusLabel(comment.status)}`,
            `- 创建时间：${displayTime(comment.createdAt)}`,
            `- 更新时间：${displayTime(comment.updatedAt)}`, '',
            '**原文**', '', quoteMarkdown(comment.selectedText || comment.headingText || docTitle(comment)), '',
            '**批注内容**', '', comment.comment?.trim() || '无', ''
          );
        });
      }
    }
  }
  const blob = new Blob([`${lines.join('\n').trim()}\n`], { type: 'text/markdown;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const date = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replaceAll('/', '-');
  const link = Object.assign(document.createElement('a'), { href: objectUrl, download: `快鹭知识库批注记录_${date}.md` });
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function CommentManager({ apiBase = '', brandSlug, basePath = '', onBack, onOpenComment }) {
  const [comments, setComments] = useState([]);
  const [status, setStatus] = useState('all');
  const [author, setAuthor] = useState('all');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('正在加载批注…');
  const [busyId, setBusyId] = useState('');
  const endpoint = (path) => `${apiBase}${path}`;

  async function load() {
    try {
      const params = new URLSearchParams({ brandSlug });
      const response = await fetch(endpoint(`/api/manage/comments?${params}`), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '批注加载失败');
      setComments(data.comments || []); setMessage('');
    } catch (reason) {
      setComments([]); setMessage(`无法加载批注：${reason.message}`);
    }
  }

  useEffect(() => { load(); }, [brandSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const authors = useMemo(() => [...new Set(comments.map((comment) => comment.authorName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [comments]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return comments.filter((comment) => {
      const normalizedStatus = comment.status === 'resolved' ? 'resolved' : 'open';
      if (status !== 'all' && normalizedStatus !== status) return false;
      if (author !== 'all' && comment.authorName !== author) return false;
      if (!keyword) return true;
      return `${comment.comment} ${comment.selectedText} ${comment.headingText} ${comment.relativePath} ${docTitle(comment)} ${comment.authorName}`.toLocaleLowerCase().includes(keyword);
    });
  }, [comments, status, author, query]);
  const totals = useMemo(() => ({ total: comments.length, open: comments.filter((comment) => comment.status !== 'resolved').length, resolved: comments.filter((comment) => comment.status === 'resolved').length }), [comments]);
  const filterDescription = `${status === 'all' ? '全部状态' : statusLabel(status)}${author === 'all' ? '' : ` / 批注人：${author}`}${query.trim() ? ` / 搜索：${query.trim()}` : ''}`;

  async function updateStatus(comment, nextStatus) {
    setBusyId(comment.id);
    try {
      const response = await fetch(endpoint(`/api/manage/comments/${comment.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '状态更新失败');
      setComments((old) => old.map((item) => item.id === comment.id ? data.comment : item)); setMessage('');
    } catch (reason) { setMessage(reason.message); } finally { setBusyId(''); }
  }

  async function remove(comment) {
    if (!window.confirm('确定删除这条批注吗？')) return;
    setBusyId(comment.id);
    try {
      const response = await fetch(endpoint(`/api/manage/comments/${comment.id}`), { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '删除失败');
      setComments((old) => old.filter((item) => item.id !== comment.id)); setMessage('');
    } catch (reason) { setMessage(reason.message); } finally { setBusyId(''); }
  }

  return <main className="comment-manager">
    <header className="comment-manager__header"><div><div className="comment-manager__eyebrow">LOCAL REVIEW WORKSPACE</div><h1>批注管理</h1><p>仅限本机查看和处理知识库批注</p></div><div className="comment-manager__header-actions"><button onClick={onBack}>返回知识库</button><button className="primary" disabled={!filtered.length} onClick={() => downloadMarkdown(filtered, filterDescription, brandSlug, basePath)}>导出批注</button></div></header>
    <section className="comment-manager__summary" aria-label="批注统计"><button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')}><span>全部批注</span><strong>{totals.total}</strong></button><button className={status === 'open' ? 'active' : ''} onClick={() => setStatus('open')}><span>待处理</span><strong>{totals.open}</strong></button><button className={status === 'resolved' ? 'active' : ''} onClick={() => setStatus('resolved')}><span>已解决</span><strong>{totals.resolved}</strong></button></section>
    <section className="comment-manager__filters"><label><span>搜索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识点、原文或批注…" /></label><label><span>批注人</span><select value={author} onChange={(event) => setAuthor(event.target.value)}><option value="all">全部批注人</option>{authors.map((name) => <option value={name} key={name}>{name}</option>)}</select></label><div className="comment-manager__result-count">当前结果 {filtered.length} 条</div></section>
    {message && <div className="comment-manager__message" role="status">{message}</div>}
    <section className="comment-manager__list">{filtered.length ? filtered.map((comment) => <article className="managed-comment" key={comment.id}>
      <div className="managed-comment__top"><div><span className={`managed-comment__status ${comment.status === 'resolved' ? 'resolved' : ''}`}>{statusLabel(comment.status)}</span><strong>{docTitle(comment)}</strong><span className="managed-comment__module">{moduleName(comment)}</span></div><time>{displayTime(comment.createdAt)}</time></div>
      <div className="managed-comment__path">{comment.relativePath}</div>
      <div className="managed-comment__body"><div><span>批注位置</span><p>{targetLabel(comment)}{comment.headingText ? ` · ${comment.headingText}` : ''}</p></div><div><span>原文</span><blockquote>{comment.selectedText || comment.headingText || docTitle(comment)}</blockquote></div><div><span>批注内容</span><p>{comment.comment}</p></div></div>
      <div className="managed-comment__footer"><span>批注人：{comment.authorName}</span><div><button onClick={() => onOpenComment(comment)}>查看原文</button><button disabled={busyId === comment.id} onClick={() => updateStatus(comment, comment.status === 'resolved' ? 'open' : 'resolved')}>{comment.status === 'resolved' ? '重新打开' : '标记已解决'}</button><button className="danger" disabled={busyId === comment.id} onClick={() => remove(comment)}>删除</button></div></div>
    </article>) : !message && <div className="comment-manager__empty">没有符合条件的批注</div>}</section>
  </main>;
}
