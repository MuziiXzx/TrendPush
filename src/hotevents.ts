// ============================================================================
// Hot Events — External data sources for trending AI events
// ============================================================================

import process from 'node:process';

// ============================================================================
// Types (internal)
// ============================================================================

export interface HNStory {
  title: string;
  url: string;
  score: number;
  commentCount: number;
  timestamp: number;
}

export interface GitHubRepo {
  name: string;
  url: string;
  description: string;
  stars: number;
  language: string;
  topics: string[];
}

export interface RSSCluster {
  keyword: string;
  articles: Array<{
    title: string;
    link: string;
    sourceName: string;
    score: number;
  }>;
}

// ============================================================================
// AI-related keyword filter
// ============================================================================

const AI_KEYWORDS = /\b(ai|artificial.intelligence|llm|gpt|openai|anthropic|claude|gemini|copilot|ml|machine.learning|deep.learning|neural|transformer|diffusion|stable.diffusion|midjourney|chatbot|rag|fine.?tun|langchain|embedding|vector.?db|agent|multimodal|vision.model|language.model|foundation.model|gen.?ai|generative)\b/i;

// ============================================================================
// Hacker News API
// ============================================================================

export async function fetchHNTopAIStories(limit = 30): Promise<HNStory[]> {
  console.log('[digest] Fetching Hacker News top stories...');

  try {
    const resp = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`HN API returned ${resp.status}`);

    const ids = (await resp.json()) as number[];
    const topIds = ids.slice(0, 100);

    // Fetch story details in parallel (batched to avoid overwhelming)
    const BATCH = 20;
    const stories: HNStory[] = [];

    for (let i = 0; i < topIds.length; i += BATCH) {
      const batch = topIds.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (id) => {
          const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
            signal: AbortSignal.timeout(10000),
          });
          if (!r.ok) return null;
          return r.json();
        })
      );

      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        const item = result.value as Record<string, unknown>;
        if (item.type !== 'story' || !item.title) continue;

        const title = String(item.title);
        const url = String(item.url || `https://news.ycombinator.com/item?id=${item.id}`);

        if (AI_KEYWORDS.test(title) || AI_KEYWORDS.test(url)) {
          stories.push({
            title,
            url,
            score: Number(item.score) || 0,
            commentCount: Number(item.descendants) || 0,
            timestamp: Number(item.time) || 0,
          });
        }
      }
    }

    // Sort by score descending, take top N
    stories.sort((a, b) => b.score - a.score);
    const result = stories.slice(0, limit);
    console.log(`[digest] HN: found ${result.length} AI-related stories (from ${topIds.length} scanned)`);
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[digest] HN fetch failed: ${msg}`);
    return [];
  }
}

// ============================================================================
// GitHub Trending AI Repos
// ============================================================================

export async function fetchTrendingAIRepos(limit = 20): Promise<GitHubRepo[]> {
  console.log('[digest] Fetching GitHub trending AI repos...');

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const query = `ai OR llm OR deep-learning OR machine-learning created:>${sevenDaysAgo} stars:>10`;

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'TrendPush/1.0',
    };

    const ghToken = process.env.GITHUB_TOKEN;
    if (ghToken) {
      headers['Authorization'] = `token ${ghToken}`;
    }

    const resp = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`,
      { headers, signal: AbortSignal.timeout(15000) }
    );

    if (!resp.ok) {
      throw new Error(`GitHub API returned ${resp.status}: ${await resp.text().catch(() => 'unknown')}`);
    }

    const data = await resp.json() as { items?: Array<Record<string, unknown>> };
    const repos: GitHubRepo[] = (data.items || []).map(item => ({
      name: String(item.full_name || item.name || ''),
      url: String(item.html_url || ''),
      description: String(item.description || ''),
      stars: Number(item.stargazers_count) || 0,
      language: String(item.language || ''),
      topics: Array.isArray(item.topics) ? item.topics.map(String) : [],
    }));

    console.log(`[digest] GitHub: found ${repos.length} trending AI repos`);
    return repos;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[digest] GitHub fetch failed: ${msg}`);
    return [];
  }
}

// ============================================================================
// RSS Article Clustering
// ============================================================================

export function clusterRSSArticles(
  articles: Array<{
    title: string;
    link: string;
    sourceName: string;
    score: number;
    scoreBreakdown: { timeliness: number };
    keywords: string[];
  }>,
): RSSCluster[] {
  // Filter articles with high timeliness
  const timely = articles.filter(a => a.scoreBreakdown.timeliness >= 7);

  // Group by keywords
  const keywordMap = new Map<string, typeof timely>();
  for (const article of timely) {
    for (const kw of article.keywords) {
      const normalized = kw.toLowerCase();
      const list = keywordMap.get(normalized) || [];
      list.push(article);
      keywordMap.set(normalized, list);
    }
  }

  // Keep clusters with 2+ articles
  const clusters: RSSCluster[] = [];
  for (const [keyword, arts] of keywordMap) {
    if (arts.length >= 2) {
      // Deduplicate by link
      const seen = new Set<string>();
      const unique = arts.filter(a => {
        if (seen.has(a.link)) return false;
        seen.add(a.link);
        return true;
      });

      if (unique.length >= 2) {
        clusters.push({
          keyword,
          articles: unique.map(a => ({
            title: a.title,
            link: a.link,
            sourceName: a.sourceName,
            score: a.score,
          })),
        });
      }
    }
  }

  // Sort by cluster size descending
  clusters.sort((a, b) => b.articles.length - a.articles.length);
  console.log(`[digest] RSS clustering: ${clusters.length} keyword clusters from ${timely.length} timely articles`);
  return clusters.slice(0, 10);
}

// ============================================================================
// Format helpers for prompt building
// ============================================================================

export function formatStarsCount(stars: number): string {
  if (stars >= 1000) return `${(stars / 1000).toFixed(1)}k stars`;
  return `${stars} stars`;
}
