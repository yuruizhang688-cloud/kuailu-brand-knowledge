import { useEffect, useMemo, useState } from 'react';
import './comment-manager.css';

const COPY = {
  'zh-CN': {
    statusResolved: '已解决', statusOpen: '待处理', targetRow: '信息行', targetBlock: '正文段落', targetDocument: '整个知识点',
    unnamedDocument: '未命名知识点', uncategorized: '未分类', unknown: '未知', missingOriginal: '未记录原文', empty: '无',
    exportTitle: '快鹭知识库批注记录', exportTime: '导出时间', commentCount: '批注数量', filterScope: '筛选范围', comment: '批注',
    filePath: '文件路径', pageLink: '页面链接', viewOriginal: '查看原文', commentTarget: '批注位置', reviewer: '批注人', status: '状态',
    createdAt: '创建时间', updatedAt: '更新时间', original: '原文', commentContent: '批注内容', exportFilename: '快鹭知识库批注记录',
    loading: '正在加载批注…', enterAdminKey: '请输入管理密钥', invalidAdminKey: '管理密钥无效，请重新输入', loadFailed: '批注加载失败',
    cannotLoad: '无法加载批注', expiredAdminKey: '管理密钥已失效，请重新输入', updateFailed: '状态更新失败', deleteConfirm: '确定删除这条批注吗？',
    deleteFailed: '删除失败', validatingKey: '正在验证管理密钥…', localWorkspace: 'LOCAL REVIEW WORKSPACE', managementEyebrow: 'COMMENT MANAGEMENT',
    managementTitle: '批注管理', localConnection: '本机安全连接线上共享批注', back: '返回知识库', adminKeyTitle: '输入管理密钥',
    adminKeyNote: '密钥只保存在当前浏览器，不会上传到知识库。', adminKeyPlaceholder: '请输入管理密钥', enterManagement: '进入批注管理',
    remoteDescription: '查看和处理线上共享批注', localDescription: '查看和处理本机批注', changeKey: '更换密钥', exportComments: '导出批注',
    statsLabel: '批注统计', allComments: '全部批注', search: '搜索', searchPlaceholder: '搜索知识点、原文或批注…', allReviewers: '全部批注人',
    currentResults: (count) => `当前结果 ${count} 条`, noResults: '没有符合条件的批注', reopen: '重新打开', resolve: '标记已解决', delete: '删除',
    allStatuses: '全部状态', reviewerFilter: (name) => `批注人：${name}`, searchFilter: (query) => `搜索：${query}`
  },
  'en-US': {
    statusResolved: 'Resolved', statusOpen: 'Open', targetRow: 'Table row', targetBlock: 'Content block', targetDocument: 'Entire knowledge point',
    unnamedDocument: 'Untitled knowledge point', uncategorized: 'Uncategorized', unknown: 'Unknown', missingOriginal: 'Original text not recorded', empty: 'None',
    exportTitle: 'Kuailu Knowledge Base Comment Records', exportTime: 'Exported at', commentCount: 'Comments', filterScope: 'Filters', comment: 'Comment',
    filePath: 'File path', pageLink: 'Page link', viewOriginal: 'View original', commentTarget: 'Comment location', reviewer: 'Reviewer', status: 'Status',
    createdAt: 'Created at', updatedAt: 'Updated at', original: 'Original text', commentContent: 'Comment', exportFilename: 'Kuailu_Knowledge_Base_Comments',
    loading: 'Loading comments…', enterAdminKey: 'Enter the management key', invalidAdminKey: 'Invalid management key. Please try again.', loadFailed: 'Failed to load comments',
    cannotLoad: 'Unable to load comments', expiredAdminKey: 'The management key has expired. Please enter it again.', updateFailed: 'Failed to update status', deleteConfirm: 'Delete this comment?',
    deleteFailed: 'Failed to delete comment', validatingKey: 'Validating management key…', localWorkspace: 'LOCAL REVIEW WORKSPACE', managementEyebrow: 'COMMENT MANAGEMENT',
    managementTitle: 'Comment Management', localConnection: 'Securely manage shared online comments from this device', back: 'Back to Knowledge Base', adminKeyTitle: 'Enter Management Key',
    adminKeyNote: 'The key is stored only in this browser and is never uploaded to the knowledge base.', adminKeyPlaceholder: 'Enter management key', enterManagement: 'Open Comment Management',
    remoteDescription: 'Review and manage shared online comments', localDescription: 'Review and manage comments saved on this device', changeKey: 'Change Key', exportComments: 'Export Comments',
    statsLabel: 'Comment statistics', allComments: 'All Comments', search: 'Search', searchPlaceholder: 'Search knowledge points, original text, or comments…', allReviewers: 'All Reviewers',
    currentResults: (count) => `${count} result${count === 1 ? '' : 's'}`, noResults: 'No comments match the current filters', reopen: 'Reopen', resolve: 'Mark as Resolved', delete: 'Delete',
    allStatuses: 'All Statuses', reviewerFilter: (name) => `Reviewer: ${name}`, searchFilter: (query) => `Search: ${query}`
  }
};

const statusLabel = (status, copy) => status === 'resolved' ? copy.statusResolved : copy.statusOpen;
const targetLabel = (comment, copy) => {
  const kind = comment.targetKind || (comment.anchorId?.includes(':row:') ? 'row' : comment.anchorId?.includes(':block:') ? 'block' : 'document');
  return kind === 'row' ? copy.targetRow : kind === 'block' ? copy.targetBlock : copy.targetDocument;
};
const cleanOrder = (value) => String(value || '').replace(/^\d+[-_. ]*/, '');
const docTitle = (comment, copy) => comment.docTitle || cleanOrder(comment.relativePath?.split('/').at(-1)?.replace(/\.md$/i, '')) || copy.unnamedDocument;
const moduleName = (comment, copy) => cleanOrder(comment.relativePath?.split('/')[0]) || copy.uncategorized;
const displayTime = (value, locale, copy) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return copy.unknown;
  return date.toLocaleString(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
};
const quoteMarkdown = (value, copy) => String(value || copy.missingOriginal).split('\n').map((line) => `> ${line}`).join('\n');
const escapeInline = (value) => String(value || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();

function downloadMarkdown(comments, filterDescription, brandSlug, basePath, locale, copy) {
  const statuses = ['open', 'resolved'];
  const lines = [
    `# ${copy.exportTitle}`, '',
    `- ${copy.exportTime}: ${displayTime(new Date(), locale, copy)}`,
    `- ${copy.commentCount}: ${comments.length}`,
    `- ${copy.filterScope}: ${filterDescription}`, ''
  ];
  for (const status of statuses) {
    const statusComments = comments.filter((comment) => (comment.status === 'resolved' ? 'resolved' : 'open') === status);
    if (!statusComments.length) continue;
    lines.push(`## ${statusLabel(status, copy)}`, '');
    const modules = [...new Set(statusComments.map((comment) => moduleName(comment, copy)))];
    for (const module of modules) {
      lines.push(`### ${module}`, '');
      const moduleComments = statusComments.filter((comment) => moduleName(comment, copy) === module);
      const documents = [...new Set(moduleComments.map((comment) => `${comment.docId}\0${comment.relativePath}`))];
      for (const documentKey of documents) {
        const documentComments = moduleComments.filter((comment) => `${comment.docId}\0${comment.relativePath}` === documentKey);
        const first = documentComments[0];
        lines.push(`#### ${docTitle(first, copy)}`, '');
        documentComments.forEach((comment, index) => {
          const pageUrl = `${location.origin}${basePath}/${brandSlug}?doc=${encodeURIComponent(comment.docId)}&mode=admin`;
          lines.push(
            `##### ${copy.comment} ${index + 1}`, '',
            `- ${copy.filePath}: ${escapeInline(comment.relativePath)}`,
            `- ${copy.pageLink}: [${copy.viewOriginal}](${pageUrl})`,
            `- ${copy.commentTarget}: ${targetLabel(comment, copy)}${comment.headingText ? ` / ${escapeInline(comment.headingText)}` : ''}`,
            `- ${copy.reviewer}: ${escapeInline(comment.authorName)}`,
            `- ${copy.status}: ${statusLabel(comment.status, copy)}`,
            `- ${copy.createdAt}: ${displayTime(comment.createdAt, locale, copy)}`,
            `- ${copy.updatedAt}: ${displayTime(comment.updatedAt, locale, copy)}`, '',
            `**${copy.original}**`, '', quoteMarkdown(comment.selectedText || comment.headingText || docTitle(comment, copy), copy), '',
            `**${copy.commentContent}**`, '', comment.comment?.trim() || copy.empty, ''
          );
        });
      }
    }
  }
  const blob = new Blob([`${lines.join('\n').trim()}\n`], { type: 'text/markdown;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const date = new Date().toLocaleDateString('sv-SE');
  const link = Object.assign(document.createElement('a'), { href: objectUrl, download: `${copy.exportFilename}_${date}.md` });
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function CommentManager({ apiBase = '', adminToken = '', requireAdminKey = false, brandSlug, basePath = '', locale = 'zh-CN', onBack, onOpenComment }) {
  const copy = locale.startsWith('en') ? COPY['en-US'] : COPY['zh-CN'];
  const [comments, setComments] = useState([]);
  const [status, setStatus] = useState('all');
  const [author, setAuthor] = useState('all');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(copy.loading);
  const [busyId, setBusyId] = useState('');
  const remoteManagement = Boolean(apiBase);
  const protectedManagement = remoteManagement && requireAdminKey;
  const [adminKey, setAdminKey] = useState(() => adminToken || localStorage.getItem('brandbase:comment-admin-key') || '');
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const endpoint = (path) => `${apiBase}${path}`;
  const headers = (extra = {}) => remoteManagement && adminKey ? { ...extra, Authorization: `Bearer ${adminKey}` } : extra;

  function clearAdminKey(nextMessage = copy.enterAdminKey) {
    localStorage.removeItem('brandbase:comment-admin-key');
    setAdminKey(''); setAdminKeyInput(''); setComments([]); setMessage(nextMessage);
  }

  async function load() {
    if (protectedManagement && !adminKey) { setComments([]); setMessage(copy.enterAdminKey); return; }
    try {
      const params = new URLSearchParams({ brandSlug });
      const response = await fetch(endpoint(`/api/manage/comments?${params}`), { cache: 'no-store', headers: headers() });
      const data = await response.json();
      if (response.status === 401 && protectedManagement) { clearAdminKey(copy.invalidAdminKey); return; }
      if (!response.ok) throw new Error(data.error || copy.loadFailed);
      setComments(data.comments || []); setMessage('');
    } catch (reason) {
      setComments([]); setMessage(`${copy.cannotLoad}: ${reason.message}`);
    }
  }

  useEffect(() => { load(); }, [brandSlug, apiBase, adminKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const authors = useMemo(() => [...new Set(comments.map((comment) => comment.authorName).filter(Boolean))].sort((a, b) => a.localeCompare(b, locale)), [comments, locale]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return comments.filter((comment) => {
      const normalizedStatus = comment.status === 'resolved' ? 'resolved' : 'open';
      if (status !== 'all' && normalizedStatus !== status) return false;
      if (author !== 'all' && comment.authorName !== author) return false;
      if (!keyword) return true;
      return `${comment.comment} ${comment.selectedText} ${comment.headingText} ${comment.relativePath} ${docTitle(comment, copy)} ${comment.authorName}`.toLocaleLowerCase().includes(keyword);
    });
  }, [comments, status, author, query]);
  const totals = useMemo(() => ({ total: comments.length, open: comments.filter((comment) => comment.status !== 'resolved').length, resolved: comments.filter((comment) => comment.status === 'resolved').length }), [comments]);
  const filterDescription = `${status === 'all' ? copy.allStatuses : statusLabel(status, copy)}${author === 'all' ? '' : ` / ${copy.reviewerFilter(author)}`}${query.trim() ? ` / ${copy.searchFilter(query.trim())}` : ''}`;

  async function updateStatus(comment, nextStatus) {
    setBusyId(comment.id);
    try {
      const response = await fetch(endpoint(`/api/manage/comments/${comment.id}`), { method: 'PATCH', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status: nextStatus }) });
      const data = await response.json();
      if (response.status === 401 && protectedManagement) { clearAdminKey(copy.expiredAdminKey); return; }
      if (!response.ok) throw new Error(data.error || copy.updateFailed);
      setComments((old) => old.map((item) => item.id === comment.id ? data.comment : item)); setMessage('');
    } catch (reason) { setMessage(reason.message); } finally { setBusyId(''); }
  }

  async function remove(comment) {
    if (!window.confirm(copy.deleteConfirm)) return;
    setBusyId(comment.id);
    try {
      const response = await fetch(endpoint(`/api/manage/comments/${comment.id}`), { method: 'DELETE', headers: headers() });
      const data = await response.json();
      if (response.status === 401 && protectedManagement) { clearAdminKey(copy.expiredAdminKey); return; }
      if (!response.ok) throw new Error(data.error || copy.deleteFailed);
      setComments((old) => old.filter((item) => item.id !== comment.id)); setMessage('');
    } catch (reason) { setMessage(reason.message); } finally { setBusyId(''); }
  }

  function submitAdminKey(event) {
    event.preventDefault();
    const value = adminKeyInput.trim();
    if (!value) return;
    localStorage.setItem('brandbase:comment-admin-key', value);
    setMessage(copy.validatingKey); setAdminKey(value);
  }

  if (protectedManagement && !adminKey) return <main className="comment-manager">
    <header className="comment-manager__header"><div><div className="comment-manager__eyebrow">{copy.localWorkspace}</div><h1>{copy.managementTitle}</h1><p>{copy.localConnection}</p></div><div className="comment-manager__header-actions"><button onClick={onBack}>{copy.back}</button></div></header>
    <form className="comment-manager__login" onSubmit={submitAdminKey}><h2>{copy.adminKeyTitle}</h2><p>{copy.adminKeyNote}</p><input type="password" value={adminKeyInput} onChange={(event) => setAdminKeyInput(event.target.value)} placeholder={copy.adminKeyPlaceholder} autoFocus required /><button className="primary" type="submit">{copy.enterManagement}</button>{message && <div role="status">{message}</div>}</form>
  </main>;

  return <main className="comment-manager">
    <header className="comment-manager__header"><div><div className="comment-manager__eyebrow">{copy.managementEyebrow}</div><h1>{copy.managementTitle}</h1><p>{remoteManagement ? copy.remoteDescription : copy.localDescription}</p></div><div className="comment-manager__header-actions"><button onClick={onBack}>{copy.back}</button>{protectedManagement && <button onClick={() => clearAdminKey()}>{copy.changeKey}</button>}<button className="primary" disabled={!filtered.length} onClick={() => downloadMarkdown(filtered, filterDescription, brandSlug, basePath, locale, copy)}>{copy.exportComments}</button></div></header>
    <section className="comment-manager__summary" aria-label={copy.statsLabel}><button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')}><span>{copy.allComments}</span><strong>{totals.total}</strong></button><button className={status === 'open' ? 'active' : ''} onClick={() => setStatus('open')}><span>{copy.statusOpen}</span><strong>{totals.open}</strong></button><button className={status === 'resolved' ? 'active' : ''} onClick={() => setStatus('resolved')}><span>{copy.statusResolved}</span><strong>{totals.resolved}</strong></button></section>
    <section className="comment-manager__filters"><label><span>{copy.search}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} /></label><label><span>{copy.reviewer}</span><select value={author} onChange={(event) => setAuthor(event.target.value)}><option value="all">{copy.allReviewers}</option>{authors.map((name) => <option value={name} key={name}>{name}</option>)}</select></label><div className="comment-manager__result-count">{copy.currentResults(filtered.length)}</div></section>
    {message && <div className="comment-manager__message" role="status">{message}</div>}
    <section className="comment-manager__list">{filtered.length ? filtered.map((comment) => <article className="managed-comment" key={comment.id}>
      <div className="managed-comment__top"><div><span className={`managed-comment__status ${comment.status === 'resolved' ? 'resolved' : ''}`}>{statusLabel(comment.status, copy)}</span><strong>{docTitle(comment, copy)}</strong><span className="managed-comment__module">{moduleName(comment, copy)}</span></div><time>{displayTime(comment.createdAt, locale, copy)}</time></div>
      <div className="managed-comment__path">{comment.relativePath}</div>
      <div className="managed-comment__body"><div><span>{copy.commentTarget}</span><p>{targetLabel(comment, copy)}{comment.headingText ? ` · ${comment.headingText}` : ''}</p></div><div><span>{copy.original}</span><blockquote>{comment.selectedText || comment.headingText || docTitle(comment, copy)}</blockquote></div><div><span>{copy.commentContent}</span><p>{comment.comment}</p></div></div>
      <div className="managed-comment__footer"><span>{copy.reviewer}: {comment.authorName}</span><div><button onClick={() => onOpenComment(comment)}>{copy.viewOriginal}</button><button disabled={busyId === comment.id} onClick={() => updateStatus(comment, comment.status === 'resolved' ? 'open' : 'resolved')}>{comment.status === 'resolved' ? copy.reopen : copy.resolve}</button><button className="danger" disabled={busyId === comment.id} onClick={() => remove(comment)}>{copy.delete}</button></div></div>
    </article>) : !message && <div className="comment-manager__empty">{copy.noResults}</div>}</section>
  </main>;
}
