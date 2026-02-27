# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrendPush — 一个零外部依赖的 TypeScript CLI 工具，从 ~90 个顶级技术博客（基于 Karpathy 推荐的 Hacker News 热门博客列表）抓取 RSS/Atom 订阅源，结合 Hacker News 热帖和 GitHub 热门仓库，通过 AI 对文章进行评分、摘要和趋势分析，生成每日热点推送 Markdown 报告。

## Commands

```bash
# 运行（需要 API key）
npx tsx src/main.ts --provider glm --api-key "your-key"

# 类型检查
npm run typecheck
```

常用参数：`--provider <glm|openai|deepseek|kimi|minimax|gemini|claude>` `--hours <n>` `--top-n <n>` `--lang <zh|en>` `--output <path>`

也可通过环境变量配置：`AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`

## Architecture

零外部依赖（仅用 Node.js 内置 `fetch`），通过 `tsx` 直接运行 TypeScript。

### 处理流水线 (main.ts)

1. **RSS 抓取** (`rss.ts`) — 并发抓取所有 feed，自带 regex-based XML 解析器（支持 RSS 2.0 和 Atom），无第三方解析库
2. **时间过滤** — 按 `--hours` 参数筛选近期文章
3. **AI 评分** (`pipeline.ts:scoreArticles`) — 按 relevance/quality/timeliness 三维度 1-10 打分，分批并发调用 AI
4. **AI 摘要** (`pipeline.ts:summarizeArticles`) — 为 top-N 文章生成中文标题、结构化摘要、推荐理由
5. **AI 趋势** (`pipeline.ts:generateHighlights`) — 生成今日看点总结
6. **报告生成** (`report.ts`) — 输出带 Mermaid 图表的 Markdown 文件

### AI 适配层 (src/ai/)

- `client.ts` — 工厂函数 `createAIClient()` + provider 预设 + JSON 响应解析
- `openai-compatible.ts` — OpenAI 兼容协议（glm/openai/deepseek/kimi/minimax 共用）
- `gemini.ts` — Google Gemini API
- `claude.ts` — Anthropic Claude API

所有 AI client 实现同一个 `AIClient` 接口（`types.ts`），仅含一个方法 `call(prompt: string): Promise<string>`。

### 关键类型 (types.ts)

- `CategoryId` — 6 种分类：`ai-ml | security | engineering | tools | opinion | other`
- `Article` → `ScoredArticle` — 文章从抓取到评分的数据流转
- `ProviderId` — 7 种 AI 提供商

### 批处理参数 (pipeline.ts)

`BATCH_SIZE = 10`（每批文章数），`MAX_CONCURRENT = 2`（并发批数）。评分和摘要共用此配置。

## Feed Configuration

RSS 源列表在 `feeds.json`，每个条目包含 `name`、`xmlUrl`（RSS/Atom 地址）、`htmlUrl`（站点主页）。
