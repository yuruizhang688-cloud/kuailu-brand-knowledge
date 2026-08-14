import { useEffect, useMemo, useState } from 'react';
import './manager.css';

const layerNames = { source: '源文件层', content: '内容层', assets: '网页素材', preview: '静态预览' };

function flat(nodes) {
  return nodes.flatMap((node) => node.type === 'file' ? [node] : flat(node.children));
}

function FileTree({ nodes, selected, onSelect, depth = 0 }) {
  return nodes.map((node) => node.type === 'folder' ? <div key={node.path} className="manager-folder"><div className="manager-folder__name" style={{ paddingLeft: 12 + depth * 14 }}>▾ {node.name}</div><FileTree nodes={node.children} selected={selected} onSelect={onSelect} depth={depth + 1} /></div> : <button className={`manager-file${selected === node.path ? ' active' : ''}`} style={{ paddingLeft: 28 + depth * 14 }} key={node.path} onClick={() => onSelect(node)}><span>▤</span><span>{node.name}</span></button>);
}

function UploadBox({ layer, onComplete }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  async function upload(event) {
    const files = [...event.target.files];
    if (!files.length) return;
    setUploading(true); setMessage('正在保存文件…');
    try {
      for (const file of files) {
        const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
        const day = new Date().toISOString().slice(0, 10);
        const response = await fetch('/api/manage/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layer, path: `imports/${day}/${file.name}`, base64 }) });
        if (!response.ok) throw new Error((await response.json()).error || '保存失败');
      }
      setMessage(`已保存 ${files.length} 个文件`); onComplete();
    } catch (error) { setMessage(error.message || '保存失败'); } finally { setUploading(false); event.target.value = ''; }
  }
  return <label className="upload-box"><input type="file" multiple onChange={upload} disabled={uploading} /><strong>{uploading ? '上传中…' : '导入文件'}</strong><span>PDF、文档、表格和图片会保存到本地源文件层；单文件不超过 20 MB。</span>{message && <em>{message}</em>}</label>;
}

export default function Manager() {
  const [tab, setTab] = useState('source'); const [overview, setOverview] = useState(null); const [selected, setSelected] = useState(null); const [content, setContent] = useState(''); const [message, setMessage] = useState(''); const [newPath, setNewPath] = useState('mayinglong-v2/01-品牌信息/02-新文档.md');
  async function refresh() { const response = await fetch('/api/manage/overview'); const data = await response.json(); setOverview(data); return data; }
  useEffect(() => { refresh().catch(() => setMessage('本地管理服务未启动。请先运行 npm run dev:api。')); }, []);
  const files = useMemo(() => overview?.layers[tab] ?? [], [overview, tab]);
  async function selectFile(file) {
    setSelected(file); if (tab !== 'content' && tab !== 'register') return;
    const response = await fetch(`/api/manage/file?layer=${tab}&path=${encodeURIComponent(file.path)}`); const data = await response.json(); setContent(data.content || '');
  }
  async function save() {
    if (!selected) return; const response = await fetch('/api/manage/file', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layer: tab, path: selected.path, content }) }); const data = await response.json(); setMessage(data.saved ? (tab === 'content' ? 'Markdown 已保存。点击“构建预览”后会更新静态网页。' : '资料台账已保存。') : data.error || '保存失败'); await refresh();
  }
  async function createDocument() {
    const cleanPath = newPath.trim(); if (!cleanPath.endsWith('.md')) return setMessage('新文档路径必须以 .md 结尾。');
    const title = cleanPath.split('/').pop().replace(/^\d+[._ -]*/, '').replace(/\.md$/, '');
    const starter = `# ${title}\n\n## 已确认事实\n\n- 待补充。\n\n## 待核对事项\n\n- [待核对] 待补充。\n\n## 来源\n\n- 待补充源文件编号。\n`;
    const response = await fetch('/api/manage/file', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layer: 'content', path: cleanPath, content: starter }) }); const data = await response.json(); if (!data.saved) return setMessage(data.error || '创建失败'); await refresh(); setSelected({ path: cleanPath, name: cleanPath.split('/').pop() }); setContent(starter); setMessage('已创建 Markdown 文档。');
  }
  async function build() { setMessage('正在构建静态知识库…'); const response = await fetch('/api/manage/build-kb', { method: 'POST' }); const data = await response.json(); setMessage(data.ok ? `构建完成：${data.result.brands} 个知识库，${data.result.docs} 篇文档。` : data.error || '构建失败'); await refresh(); }
  return <main className="manager"><header className="manager-header"><div><span className="manager-kicker">LOCAL KNOWLEDGE BASE</span><h1>知识库工作台</h1><p>源文件保留原样，Markdown 负责正式内容，静态预览用于查阅与审阅。</p></div><div className="manager-actions"><button onClick={build} className="manager-primary">构建预览</button><a href="/mayinglong-v2" target="_blank" rel="noreferrer">打开知识库</a></div></header>
    <section className="manager-summary">{[['source', '源文件层', 'sourceFiles'], ['content', '内容层', 'contentFiles'], ['assets', '网页素材', 'assetFiles']].map(([key, label, count]) => <button key={key} className={tab === key ? 'selected' : ''} onClick={() => { setTab(key); setSelected(null); }}><strong>{overview ? overview.summary[count] : '—'}</strong><span>{label}</span></button>)}</section>
    <nav className="manager-tabs">{Object.entries(layerNames).map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setSelected(null); }}>{label}</button>)}</nav>
    {message && <div className="manager-message">{message}</div>}
    {tab === 'preview' ? <section className="preview-pane"><div className="preview-pane__bar"><div><strong>静态网页预览</strong><span>点击“构建预览”后，Markdown 会转换为可搜索、可下载的知识库。</span></div><a href="/mayinglong-v2" target="_blank" rel="noreferrer">新窗口打开</a></div><iframe title="知识库静态预览" src="/mayinglong-v2" /></section> : <section className="manager-workspace"><aside className="manager-browser"><div className="manager-browser__head"><strong>{layerNames[tab]}</strong><span>{overview ? flat(files).length : 0} 项</span></div>{tab === 'source' || tab === 'assets' ? <UploadBox layer={tab} onComplete={refresh} /> : null}{tab === 'content' && <div className="new-document"><input value={newPath} onChange={(event) => setNewPath(event.target.value)} /><button onClick={createDocument}>新建 Markdown</button></div>}<div className="manager-file-list">{overview ? <FileTree nodes={files} selected={selected?.path} onSelect={selectFile} /> : <p>正在读取本地目录…</p>}</div></aside><section className="manager-editor">{tab === 'content' ? selected ? <><div className="manager-editor__head"><span>{selected.path}</span><button onClick={save}>保存 Markdown</button></div><textarea value={content} onChange={(event) => setContent(event.target.value)} spellCheck="false" /></> : <div className="manager-empty">从左侧选择 Markdown，或创建一篇新文档。</div> : <div className="manager-empty">{tab === 'source' ? '将客户提供的 PDF、Word、Excel、PPT 和图片导入这里。原文件只新增，不在此处编辑。' : '将需要在网页中展示的已处理图片与附件导入这里。'}</div>}</section></section>}
  </main>;
}
