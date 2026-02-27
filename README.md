# TrendPush

AI-powered trending tech digest — scans 90 top tech blogs, Hacker News, and GitHub to deliver a daily curated report.

## Features

- **90 RSS Sources** — Curated from [Karpathy's recommended HN top blogs](https://refactoringenglish.com/tools/hn-popularity/)
- **Multi-source Hot Events** — Aggregates Hacker News top stories, GitHub trending repos, and RSS article clustering
- **AI Scoring** — Rates articles on relevance, quality, and timeliness (1-10 each)
- **AI Summaries** — Generates structured Chinese/English summaries for top articles
- **Trend Analysis** — Identifies daily highlights and synthesizes hot events across sources
- **7 AI Providers** — GLM, OpenAI, DeepSeek, Kimi, MiniMax, Gemini, Claude
- **Zero Dependencies** — Only uses Node.js built-in `fetch`, no third-party packages
- **Mermaid Charts** — Output includes pie charts and bar charts for visual statistics

## Quick Start

```bash
# Install dev dependencies
npm install

# Run with your AI provider
npx tsx src/main.ts --provider glm --api-key "your-key"

# Or use environment variables
AI_PROVIDER=glm AI_API_KEY=xxx npx tsx src/main.ts
```

## CLI Options

```
Options:
  --provider <name>  AI provider: glm, openai, deepseek, kimi, minimax, gemini, claude (default: glm)
  --api-key <key>    API key for the provider (or set AI_API_KEY env var)
  --base-url <url>   Override provider's default base URL
  --model <name>     Override provider's default model
  --hours <n>        Time range in hours (default: 48)
  --top-n <n>        Number of top articles to include (default: 15)
  --lang <lang>      Summary language: zh or en (default: zh)
  --output <path>    Output file path (default: ./digest-YYYYMMDD.md)
  --no-hot-events    Skip hot events fetching (faster)
  --help             Show this help

Environment variables:
  AI_PROVIDER        Provider name
  AI_API_KEY         API key
  AI_BASE_URL        Base URL override
  AI_MODEL           Model override
  GITHUB_TOKEN       Optional: GitHub token for higher API rate limits
```

## Example

```bash
# Full run: 48h articles, top 15, with hot events
npx tsx src/main.ts --provider glm --api-key "your-key"

# Quick run: 24h, top 5, skip hot events
npx tsx src/main.ts --provider deepseek --api-key "your-key" --hours 24 --top-n 5 --no-hot-events

# English output
npx tsx src/main.ts --provider gemini --api-key "your-key" --lang en
```

## Pipeline

```
RSS Feeds (90 sources)
        │
        ▼
  Fetch & Parse ──► Time Filter (--hours)
        │
        ▼
   AI Scoring ──► Top-N Selection
        │
        ├──► Hacker News API ──┐
        ├──► GitHub Search ────┤
        ├──► RSS Clustering ───┤
        │                      ▼
        │              AI Hot Events Synthesis
        │
        ▼
  AI Summaries ──► AI Highlights ──► Markdown Report
```

## Output

The generated report includes:

- **Today's Highlights** — 3-5 sentence macro summary
- **Hot AI Events** — Cross-source trending events with significance levels (BREAKING / TRENDING / EMERGING)
- **Must-Read Top 3** — Deep showcase with summaries and recommendations
- **Statistics** — Category distribution pie chart, keyword bar chart, tag cloud
- **Categorized Articles** — All selected articles grouped by category

## License

[MIT](LICENSE)
