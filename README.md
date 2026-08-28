# BrandBase clean-room replica

这是基于公开可观察行为重建的实现，不包含原站源码、原站内容或原站批注数据。它复现了可验证的接口契约与核心行为：`/{brandSlug}?doc={docId}&edit=1` 路由、Markdown 文档树、全文搜索、本地草稿、全库 Markdown 导出，以及批注的读取、新建、修改和删除。

在线阅读页顶部提供“批注”和“导出”：知识库导出文件是保留目录层级的 ZIP，内部只包含 `.md` 正文。批注单独管理和导出，不会混入知识库正文或文章生成 Skill 的知识库文件。

## 启动

```bash
nvm use                 # Node 24 LTS；没有 nvm 时见下方说明
npm install
npm run dev:api  # 终端 1，http://localhost:8787
npm run dev:web  # 终端 2，http://localhost:5173
```

浏览器打开 `http://localhost:5173/kuailu-v2`。生产构建使用 `npm run build`；可用 `PORT=8787 npm start` 单独启动 API。

## 批注与本机管理

- 阅读页支持对整个知识点、正文段落和表格行添加批注。线上版连接共享批注 API 与 D1 持久化数据库，不同用户可看到同一知识点的全部批注。
- 批注人可在原文批注面板修改或删除自己的批注。
- `http://localhost:5173/comments` 是本机批注管理页，通过管理密钥读取线上同一份批注数据，可搜索、筛选、标记已解决、重新打开、删除、返回原文，并将当前筛选结果导出为单个 Markdown 文件。
- “批注管理”按钮和 `/comments` 页只在 `localhost`、`127.0.0.1` 或 `::1` 下显示；对应的管理 API 也会校验回环访问。

## 本地知识库工作台

启动前后端后，打开 `http://localhost:5173/manage`。工作台包含：

- **源文件层**：导入 PDF、Word、Excel、PPT、图片等原始资料；文件只新增，不在网页内改写。
- **内容层**：新建和编辑 Markdown；目录结构就是知识库左侧树结构。
- **网页素材**：存放需要在知识库中展示的已处理图片和附件。
- **静态预览**：点击“构建预览”后，将 Markdown 生成目录、文档 JSON、全文搜索索引和 ZIP 导出数据；预览地址为 `http://localhost:5173/mayinglong-v2`。

工作台使用知识库面板上级目录中的数据层：

```text
01-source-files/       原始资料
02-source-register/    源文件台账
03-content-source/     Markdown 正式内容
04-assets/             网页展示素材
```

上传文件当前限制为单文件 20 MB。大文件请直接放入 `01-source-files/` 后刷新工作台。

本项目通过 `.nvmrc` 固定在 Node 24 LTS。若使用 Homebrew 且尚未安装该版本，执行 `brew install node@24`，然后在当前终端运行 `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`；确认 `node -v` 是 `v24.x` 后再安装依赖。不要复用失败安装留下的 `node_modules` 或 lockfile。

在 macOS Apple Silicon 上，Rolldown 的原生绑定已被列为显式开发依赖，避免 npm 漏装可选依赖的问题。

## 观察到的原站接口契约

| 方法 | 路径 | 输入 | 输出 |
| --- | --- | --- | --- |
| GET | `/api/comments?brandSlug=&docId=&editKey=` | 品牌、文档、可选编辑密钥 | `{ comments: Comment[] }` |
| POST | `/api/comments` | `CommentCreate` | `{ comment: Comment }` |
| PATCH | `/api/comments/:id` | `comment`、`suggestedText`、`website`、`editKey` | `{ comment: Comment }` |
| DELETE | `/api/comments/:id` | `editKey` | `{ deleted: true }` |
| GET | `/api/manage/comments?brandSlug=` | 本机管理列表 | `{ comments: Comment[] }` |
| PATCH | `/api/manage/comments/:id` | `status: open \| resolved` | `{ comment: Comment }` |
| DELETE | `/api/manage/comments/:id` | 本机管理删除 | `{ deleted: true }` |

本实现不会请求或依赖原站 API。`editKey` 是本机生成的随机所有权密钥；服务端只保存哈希，读取时以 `canEdit` 表示是否可编辑。生产环境请改为用户身份认证与数据库，而不是把编辑密钥当作权限系统。

## 在线批注配置

GitHub Pages 仅托管阅读前端，线上共享批注由 `comments-worker/` 中的 Cloudflare Worker 接收，并保存到 D1 数据库。GitHub 仓库的 Actions variable 已通过以下值连接公共 API：

```text
COMMENTS_API_URL=https://kuailu-comments-api.yuruizhang688.workers.dev
```

Pages 工作流会把它作为 `VITE_COMMENTS_API_URL` 注入构建。公开批注接口允许来自知识库站点的请求；管理接口只允许本机页面来源，并强制验证 Worker 密钥。管理密钥仅保存在本机已忽略的 `.env.local` 和 Cloudflare Secret 中，不会进入 Git 或 GitHub Pages 构建。

## 数据格式

`public/kb/manifest.json` 列出品牌；每个品牌 `manifest.json` 中包含 `docs`、`tree`、`searchChunks` 和 `exportUrl`。单篇文档是 `{ id, markdown, ...metadata }`。这与公开页面可观察到的静态内容加载方式保持兼容，但这里仅附带 demo 数据。
