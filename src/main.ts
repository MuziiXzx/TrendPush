import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import type { CliConfig, ProviderId, FeedSource, HotEvent } from './types.js';
import { createAIClient } from './ai/client.js';
import { fetchAllFeeds } from './rss.js';
import { preflightCheck, scoreArticles, summarizeArticles, generateHighlights, synthesizeHotEvents } from './pipeline.js';
import { generateDigestReport } from './report.js';
import { fetchHNTopAIStories, fetchTrendingAIRepos, clusterRSSArticles } from './hotevents.js';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

const VALID_PROVIDERS = new Set<ProviderId>(['glm', 'openai', 'deepseek', 'kimi', 'minimax', 'gemini', 'claude']);

function printUsage(): never {
  console.log(`TrendPush - AI-powered trending tech digest from 90 top blogs

Usage:
  npx tsx src/main.ts [options]

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
  AI_PROVIDER        Provider name (same as --provider)
  AI_API_KEY         API key (same as --api-key)
  AI_BASE_URL        Base URL override (same as --base-url)
  AI_MODEL           Model override (same as --model)
  GITHUB_TOKEN       Optional: GitHub token for higher API rate limits

Examples:
  npx tsx src/main.ts --provider glm --api-key "your-key"
  npx tsx src/main.ts --provider deepseek --api-key "your-key" --hours 24 --top-n 10
  AI_PROVIDER=glm AI_API_KEY=xxx npx tsx src/main.ts
`);
  process.exit(0);
}

function parseArgs(): CliConfig {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) printUsage();

  let provider: string = process.env.AI_PROVIDER || 'glm';
  let apiKey: string = process.env.AI_API_KEY || '';
  let baseUrl: string | undefined = process.env.AI_BASE_URL;
  let model: string | undefined = process.env.AI_MODEL;
  let hours = 48;
  let topN = 15;
  let lang: 'zh' | 'en' = 'zh';
  let output = '';
  let noHotEvents = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    switch (arg) {
      case '--provider':   provider = args[++i] || provider; break;
      case '--api-key':    apiKey = args[++i] || apiKey; break;
      case '--base-url':   baseUrl = args[++i]; break;
      case '--model':      model = args[++i]; break;
      case '--hours':      hours = parseInt(args[++i] || '48', 10); break;
      case '--top-n':      topN = parseInt(args[++i] || '15', 10); break;
      case '--lang':       lang = (args[++i] as 'zh' | 'en') || lang; break;
      case '--output':     output = args[++i] || output; break;
      case '--no-hot-events': noHotEvents = true; break;
    }
  }

  if (!VALID_PROVIDERS.has(provider as ProviderId)) {
    console.error(`[digest] Error: Unknown provider "${provider}". Valid: ${[...VALID_PROVIDERS].join(', ')}`);
    process.exit(1);
  }

  if (!apiKey) {
    console.error('[digest] Error: Missing API key. Use --api-key or set AI_API_KEY env var.');
    process.exit(1);
  }

  if (!output) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    output = `./digest-${dateStr}.md`;
  }

  return {
    provider: provider as ProviderId,
    apiKey,
    baseUrl,
    model,
    hours,
    topN,
    lang,
    output,
    noHotEvents,
  };
}

// ============================================================================
// Load feeds.json
// ============================================================================

function loadFeeds(): FeedSource[] {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const feedsPath = resolve(__dirname, '..', 'feeds.json');
  const raw = readFileSync(feedsPath, 'utf-8');
  return JSON.parse(raw) as FeedSource[];
}

// ============================================================================
// Main Pipeline
// ============================================================================

async function main(): Promise<void> {
  const config = parseArgs();
  const feeds = loadFeeds();

  const aiClient = createAIClient(config.provider, config.apiKey, config.baseUrl, config.model);

  console.log(`[digest] === TrendPush ===`);
  console.log(`[digest] Provider: ${config.provider}`);
  console.log(`[digest] Time range: ${config.hours} hours`);
  console.log(`[digest] Top N: ${config.topN}`);
  console.log(`[digest] Language: ${config.lang}`);
  console.log(`[digest] Output: ${config.output}`);
  console.log('');

  // Preflight: verify AI connection before doing any heavy work
  await preflightCheck(aiClient);
  console.log('');

  // Step 1: Fetch RSS feeds
  console.log(`[digest] Step 1/6: Fetching ${feeds.length} RSS feeds...`);
  const allArticles = await fetchAllFeeds(feeds);

  if (allArticles.length === 0) {
    console.error('[digest] Error: No articles fetched from any feed. Check network connection.');
    process.exit(1);
  }

  // Step 2: Filter by time range
  console.log(`[digest] Step 2/6: Filtering by time range (${config.hours} hours)...`);
  const cutoffTime = new Date(Date.now() - config.hours * 60 * 60 * 1000);
  const recentArticles = allArticles.filter(a => a.pubDate.getTime() > cutoffTime.getTime());

  console.log(`[digest] Found ${recentArticles.length} articles within last ${config.hours} hours`);

  if (recentArticles.length === 0) {
    console.error(`[digest] Error: No articles found within the last ${config.hours} hours.`);
    console.error(`[digest] Try increasing --hours (e.g., --hours 168 for one week)`);
    process.exit(1);
  }

  // Step 3: AI scoring
  console.log(`[digest] Step 3/6: AI scoring ${recentArticles.length} articles...`);
  const scores = await scoreArticles(recentArticles, aiClient);

  const scoredArticles = recentArticles.map((article, index) => {
    const score = scores.get(index) || { relevance: 5, quality: 5, timeliness: 5, category: 'other' as const, keywords: [] };
    return {
      ...article,
      totalScore: score.relevance + score.quality + score.timeliness,
      breakdown: score,
    };
  });

  scoredArticles.sort((a, b) => b.totalScore - a.totalScore);
  const topArticles = scoredArticles.slice(0, config.topN);

  console.log(`[digest] Top ${config.topN} articles selected (score range: ${topArticles[topArticles.length - 1]?.totalScore || 0} - ${topArticles[0]?.totalScore || 0})`);

  // Step 4: Hot events (external sources + RSS clustering)
  let hotEvents: HotEvent[] = [];
  if (!config.noHotEvents) {
    console.log(`[digest] Step 4/6: Fetching hot events...`);

    // Fetch external sources in parallel
    const [hnStories, githubRepos] = await Promise.all([
      fetchHNTopAIStories(),
      fetchTrendingAIRepos(),
    ]);

    // Cluster RSS articles by keywords
    const rssForClustering = scoredArticles.map(a => ({
      title: a.title,
      link: a.link,
      sourceName: a.sourceName,
      score: a.totalScore,
      scoreBreakdown: { timeliness: a.breakdown.timeliness },
      keywords: a.breakdown.keywords,
    }));
    const rssClusters = clusterRSSArticles(rssForClustering);

    // AI synthesis
    hotEvents = await synthesizeHotEvents(hnStories, githubRepos, rssClusters, aiClient, config.lang);
  } else {
    console.log(`[digest] Step 4/6: Skipping hot events (--no-hot-events)`);
  }

  // Step 5: AI summaries
  console.log(`[digest] Step 5/6: Generating AI summaries...`);
  const indexedTopArticles = topArticles.map((a, i) => ({ ...a, index: i }));
  const summaries = await summarizeArticles(indexedTopArticles, aiClient, config.lang);

  const finalArticles = topArticles.map((a, i) => {
    const sm = summaries.get(i) || { titleZh: a.title, summary: a.description.slice(0, 200), reason: '' };
    return {
      title: a.title,
      link: a.link,
      pubDate: a.pubDate,
      description: a.description,
      sourceName: a.sourceName,
      sourceUrl: a.sourceUrl,
      score: a.totalScore,
      scoreBreakdown: {
        relevance: a.breakdown.relevance,
        quality: a.breakdown.quality,
        timeliness: a.breakdown.timeliness,
      },
      category: a.breakdown.category,
      keywords: a.breakdown.keywords,
      titleZh: sm.titleZh,
      summary: sm.summary,
      reason: sm.reason,
    };
  });

  // Step 6: Generate highlights
  console.log(`[digest] Step 6/6: Generating today's highlights...`);
  const highlights = await generateHighlights(finalArticles, aiClient, config.lang);

  const successfulSources = new Set(allArticles.map(a => a.sourceName));

  const report = generateDigestReport(finalArticles, highlights, hotEvents, {
    totalFeeds: feeds.length,
    successFeeds: successfulSources.size,
    totalArticles: allArticles.length,
    filteredArticles: recentArticles.length,
    hours: config.hours,
    lang: config.lang,
  });

  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, report);

  console.log('');
  console.log(`[digest] ✅ Done!`);
  console.log(`[digest] 📁 Report: ${config.output}`);
  console.log(`[digest] 📊 Stats: ${successfulSources.size} sources → ${allArticles.length} articles → ${recentArticles.length} recent → ${finalArticles.length} selected`);

  if (finalArticles.length > 0) {
    console.log('');
    console.log(`[digest] 🏆 Top 3 Preview:`);
    for (let i = 0; i < Math.min(3, finalArticles.length); i++) {
      const a = finalArticles[i]!;
      console.log(`  ${i + 1}. ${a.titleZh || a.title}`);
      console.log(`     ${a.summary.slice(0, 80)}...`);
    }
  }
}

await main().catch((err) => {
  console.error(`[digest] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
