# Changelog

## Unreleased

### Added
- **兴趣领域热度表**：每日日报顶部新增"今日兴趣领域热度"表，按命中论文数 × 平均 LLM 分 × 关键词权重排序，展示当天最活跃的感兴趣方向及代表论文链接。
- **精选论文 section**：Deep Read 完成后，在 AI 总结下方插入"精选论文 / Featured Papers"表，集中展示精读论文的评分、关键词命中和 Deep Read 笔记跳转链接；All Papers 表中同样带 Deep Read 链接。
- **浮动进度 widget 实时 token 显示**：运行过程中每次 LLM 调用完成后，浮动进度条底部实时更新累计 token 消耗（输入 + 输出 + 合计）。
- **Token 警告**：单次调用输入超过 20k tokens 时写 `[WARN][TOKEN]` 日志；全程累计超过 50k 时在日志末尾附上调优建议。
- **日志自动轮转**：`runs.log` 超过 10MB 时自动丢弃旧前半段，保留最新内容，防止日志文件无限增长。
- **VaultWriter.appendLogWithRotation**：带大小上限的日志追加方法，按换行符对齐截断位置。

### Changed
- **精读篇数输入方式**：设置页中 Deep Read 篇数由滑块（1–10）改为数字输入框（1–999），默认值从 5 改为 10。
- **错误日志格式统一**：所有错误日志改用结构化前缀（`[ERROR][FETCH]`、`[ERROR][HF_FETCH]`、`[ERROR][SCORING]`、`[ERROR][LLM]`、`[ERROR][WRITE]`），带 `key=value` 字段，便于检索。
- **日报文档结构调整**：section 顺序改为：兴趣领域热度 → AI 总结 → 精选论文 → 领域热度 → All Papers。
- **Deep Read 文件名模板**：支持 `{{title}}`、`{{arxivId}}`、`{{date}}`、`{{model}}`、`{{year}}`、`{{month}}`、`{{day}}` 占位符，且按日期子目录组织文件。
- **Backfill 后台模式**：批量回填支持后台运行，带独立浮动进度 widget 和停止按钮，与每日运行互不阻塞。

### Removed
- **PDF 下载功能**：移除 `paperDownloader.ts`、`paperDownload` 配置项、`Paper.links.localPdf` 字段及 Anthropic provider 的 `pdfBase64` 注入，简化 pipeline。

### Fixed
- **All Papers 表格列分裂**：修复 wikilink 中 `|` 字符未转义导致 Markdown 表格列错位的问题。

---

## 1.0.0 — Initial Release

- Daily arXiv fetch，按分类 + 关键词检索，支持时间窗口去重。
- HuggingFace Papers 作为第二数据源，支持 streak 追踪和 upvote 加权排名。
- 加权兴趣关键词系统，LLM 批量打分（每批 10 篇）+ 重排序。
- Deep Read：抓取 arxiv.org/html 全文，逐篇 LLM 分析，写入独立笔记。
- Prompt Library：内置 daily / scoring / deepread 三套提示词，支持自定义模板。
- Backfill：按日期范围补生成历史日报。
- 定时调度器：daily 08:30 / weekly 周六 18:00 / monthly 每月 1 日 09:00，基于 tick + 时间戳防重复触发。
- 浮动进度 widget，支持停止按钮 + AbortSignal 中断 pipeline。
- 多 LLM Provider 支持：OpenAI compatible（DeepSeek、GLM、Minimax、Moonshot、Qwen 等）+ Anthropic，带 Provider 预设按钮。
- Vault 输出：`inbox/`（日报）、`papers/`（JSON 快照）、`deep-read/`（精读笔记）、`cache/`（状态 + 日志）。
