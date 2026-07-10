# Cloudflare Worker

`index.js` 与扩展设置页中提供的 Worker 示例保持一致。它只保存一个 KV 键
`history.json`，并使用 `SYNC_TOKEN` 验证 GET、PUT 和 DELETE 请求。

部署时必须配置：

- KV binding：`BILI_HISTORY_SYNC`
- Secret：`SYNC_TOKEN`

不要把真实同步密钥提交到仓库。
