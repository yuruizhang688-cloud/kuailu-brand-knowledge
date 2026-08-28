# 快鹭知识库共享批注 API

该 Worker 为 GitHub Pages 上的知识库提供共享批注读写，并用 Cloudflare D1 保存数据。

- 公开批注接口只允许已配置的 GitHub Pages 来源和本机开发来源修改数据。
- 用户修改或删除自己的批注时，由浏览器所有权密钥校验。服务端只保存 SHA-256 哈希。
- 管理接口允许已配置的 GitHub Pages 来源访问，供带 `mode=admin` 后缀的管理界面使用。
- 本机来源访问管理接口时仍要求 `Authorization: Bearer <ADMIN_TOKEN>`；`ADMIN_TOKEN` 必须使用 Wrangler Secret 设置，不得写入源码或 `wrangler.jsonc`。

本地开发：

```bash
npm install
npm run migrate:local
npm run dev
```

部署：

```bash
npm run check
npm run migrate:remote
npm run deploy
```
