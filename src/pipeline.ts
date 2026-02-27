import type { AIClient, Article, ScoredArticle, CategoryId, ScoringResult, SummaryResult, HotEvent } from './types.js';
import { parseJsonResponse } from './ai/client.js';
import { buildScoringPrompt, buildSummaryPrompt, buildHighlightsPrompt, buildHotEventsPrompt } from './prompts.js';
import type { HNStory, GitHubRepo, RSSCluster } from './hotevents.js';

// ============================================================================
// Constants
// ============================================================================

const BATCH_SIZE = 10;
const MAX_CONCURRENT = 2;

const VALID_CATEGORIES = new Set<string>(['ai-ml', 'security', 'engineering', 'tools', 'opinion', 'other']);

// ============================================================================
// AI Connection Preflight Check
// ============================================================================

export async function preflightCheck(aiClient: AIClient): Promise<void> {
  console.log('[digest] Preflight: testing AI connection...');
  try {
    const response = await aiClient.call('Respond with exactly: {"ok":true}');
    if (!response || response.trim().length === 0) {
      throw new Error('AI returned empty response');
    }
    console.log('[digest] Preflight: AI connection OK');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `AI connection failed! Please check your --provider, --api-key, --base-url, and --model.\n` +
      `  Error detail: ${msg}`
    );
  }
}

// ============================================================================
// Scoring Pipeline
// ============================================================================

export async function scoreArticles(
  articles: Article[],
  aiClient: AIClient,
): Promise<Map<number, { relevance: number; quality: number; timeliness: number; category: CategoryId; keywords: string[] }>> {
  const allScores = new Map<number, { relevance: number; quality: number; timeliness: number; category: CategoryId; keywords: string[] }>();

  const indexed = articles.map((article, index) => ({
    index,
    title: article.title,
    description: article.description,
    sourceName: article.sourceName,
  }));

  const batches: typeof indexed[] = [];
  for (let i = 0; i < indexed.length; i += BATCH_SIZE) {
    batches.push(indexed.slice(i, i + BATCH_SIZE));
  }

  console.log(`[digest] AI scoring: ${articles.length} articles in ${batches.length} batches`);

  let successCount = 0;
  let failCount = 0;
  let firstError = '';

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
    const batchGroup = batches.slice(i, i + MAX_CONCURRENT);
    const promises = batchGroup.map(async (batch) => {
      try {
        const prompt = buildScoringPrompt(batch);
        const responseText = await aiClient.call(prompt);
        const parsed = parseJsonResponse<ScoringResult>(responseText);

        if (parsed.results && Array.isArray(parsed.results)) {
          for (const result of parsed.results) {
            const clamp = (v: number) => Math.min(10, Math.max(1, Math.round(v)));
            const cat = (VALID_CATEGORIES.has(result.category) ? result.category : 'other') as CategoryId;
            allScores.set(result.index, {
              relevance: clamp(result.relevance),
              quality: clamp(result.quality),
              timeliness: clamp(result.timeliness),
              category: cat,
              keywords: Array.isArray(result.keywords) ? result.keywords.slice(0, 4) : [],
            });
          }
          successCount++;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!firstError) firstError = msg;
        failCount++;
        console.error(`[digest] Scoring batch failed: ${msg}`);
        for (const item of batch) {
          allScores.set(item.index, { relevance: 5, quality: 5, timeliness: 5, category: 'other', keywords: [] });
        }
      }
    });

    await Promise.all(promises);
    console.log(`[digest] Scoring progress: ${Math.min(i + MAX_CONCURRENT, batches.length)}/${batches.length} batches (${successCount} ok, ${failCount} failed)`);
  }

  if (successCount === 0 && batches.length > 0) {
    throw new Error(
      `All ${failCount} scoring batches failed! AI API is not working.\n` +
      `  First error: ${firstError}\n` +
      `  Check your --provider, --api-key, --base-url, and --model settings.`
    );
  }

  if (failCount > 0) {
    console.warn(`[digest] WARNING: ${failCount}/${batches.length} scoring batches failed (${successCount} succeeded). Results may be incomplete.`);
  }

  return allScores;
}

// ============================================================================
// Summary Pipeline
// ============================================================================

export async function summarizeArticles(
  articles: Array<Article & { index: number }>,
  aiClient: AIClient,
  lang: 'zh' | 'en',
): Promise<Map<number, { titleZh: string; summary: string; reason: string }>> {
  const summaries = new Map<number, { titleZh: string; summary: string; reason: string }>();

  const indexed = articles.map(a => ({
    index: a.index,
    title: a.title,
    description: a.description,
    sourceName: a.sourceName,
    link: a.link,
  }));

  const batches: typeof indexed[] = [];
  for (let i = 0; i < indexed.length; i += BATCH_SIZE) {
    batches.push(indexed.slice(i, i + BATCH_SIZE));
  }

  console.log(`[digest] Generating summaries for ${articles.length} articles in ${batches.length} batches`);

  let successCount = 0;
  let failCount = 0;
  let firstError = '';

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
    const batchGroup = batches.slice(i, i + MAX_CONCURRENT);
    const promises = batchGroup.map(async (batch) => {
      try {
        const prompt = buildSummaryPrompt(batch, lang);
        const responseText = await aiClient.call(prompt);
        const parsed = parseJsonResponse<SummaryResult>(responseText);

        if (parsed.results && Array.isArray(parsed.results)) {
          for (const result of parsed.results) {
            summaries.set(result.index, {
              titleZh: result.titleZh || '',
              summary: result.summary || '',
              reason: result.reason || '',
            });
          }
          successCount++;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!firstError) firstError = msg;
        failCount++;
        console.error(`[digest] Summary batch failed: ${msg}`);
        for (const item of batch) {
          summaries.set(item.index, { titleZh: item.title, summary: item.title, reason: '' });
        }
      }
    });

    await Promise.all(promises);
    console.log(`[digest] Summary progress: ${Math.min(i + MAX_CONCURRENT, batches.length)}/${batches.length} batches (${successCount} ok, ${failCount} failed)`);
  }

  if (successCount === 0 && batches.length > 0) {
    throw new Error(
      `All ${failCount} summary batches failed! AI API is not working.\n` +
      `  First error: ${firstError}\n` +
      `  Check your --provider, --api-key, --base-url, and --model settings.`
    );
  }

  if (failCount > 0) {
    console.warn(`[digest] WARNING: ${failCount}/${batches.length} summary batches failed (${successCount} succeeded). Results may be incomplete.`);
  }

  return summaries;
}

// ============================================================================
// Highlights / Trend Analysis
// ============================================================================

export async function generateHighlights(
  articles: ScoredArticle[],
  aiClient: AIClient,
  lang: 'zh' | 'en',
): Promise<string> {
  const articleList = articles.slice(0, 10).map((a, i) =>
    `${i + 1}. [${a.category}] ${a.titleZh || a.title} — ${a.summary.slice(0, 100)}`
  ).join('\n');

  const prompt = buildHighlightsPrompt(articleList, lang);

  try {
    const text = await aiClient.call(prompt);
    return text.trim();
  } catch (error) {
    console.warn(`[digest] Highlights generation failed: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

// ============================================================================
// Hot Events Synthesis
// ============================================================================

export async function synthesizeHotEvents(
  hnStories: HNStory[],
  githubRepos: GitHubRepo[],
  rssClusters: RSSCluster[],
  aiClient: AIClient,
  lang: 'zh' | 'en',
): Promise<HotEvent[]> {
  if (hnStories.length === 0 && githubRepos.length === 0 && rssClusters.length === 0) {
    console.warn('[digest] No hot event data available, skipping synthesis');
    return [];
  }

  console.log(`[digest] Synthesizing hot events from ${hnStories.length} HN stories, ${githubRepos.length} GitHub repos, ${rssClusters.length} RSS clusters...`);

  const prompt = buildHotEventsPrompt(hnStories, githubRepos, rssClusters, lang);

  try {
    const responseText = await aiClient.call(prompt);
    const parsed = parseJsonResponse<{ events: HotEvent[] }>(responseText);

    if (!parsed.events || !Array.isArray(parsed.events)) {
      console.warn('[digest] Hot events: invalid AI response format');
      return [];
    }

    const validSignificance = new Set(['breaking', 'trending', 'emerging']);
    const events = parsed.events
      .filter(e => e.title && e.summary)
      .map(e => ({
        ...e,
        significance: validSignificance.has(e.significance) ? e.significance : 'trending' as const,
        sources: Array.isArray(e.sources) ? e.sources : [],
        keywords: Array.isArray(e.keywords) ? e.keywords : [],
      }));

    console.log(`[digest] Hot events: ${events.length} events synthesized`);
    return events;
  } catch (error) {
    console.warn(`[digest] Hot events synthesis failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
