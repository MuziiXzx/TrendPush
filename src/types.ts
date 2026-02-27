// ============================================================================
// Category System
// ============================================================================

export type CategoryId = 'ai-ml' | 'security' | 'engineering' | 'tools' | 'opinion' | 'other';

export const CATEGORY_META: Record<CategoryId, { emoji: string; label: string }> = {
  'ai-ml':       { emoji: '🤖', label: 'AI / ML' },
  'security':    { emoji: '🔒', label: '安全' },
  'engineering': { emoji: '⚙️', label: '工程' },
  'tools':       { emoji: '🛠', label: '工具 / 开源' },
  'opinion':     { emoji: '💡', label: '观点 / 杂谈' },
  'other':       { emoji: '📝', label: '其他' },
};

// ============================================================================
// Article Types
// ============================================================================

export interface Article {
  title: string;
  link: string;
  pubDate: Date;
  description: string;
  sourceName: string;
  sourceUrl: string;
}

export interface ScoredArticle extends Article {
  score: number;
  scoreBreakdown: {
    relevance: number;
    quality: number;
    timeliness: number;
  };
  category: CategoryId;
  keywords: string[];
  titleZh: string;
  summary: string;
  reason: string;
}

// ============================================================================
// Hot Events
// ============================================================================

export interface HotEvent {
  title: string;
  summary: string;
  significance: 'breaking' | 'trending' | 'emerging';
  sources: Array<{
    type: 'hn' | 'github' | 'rss';
    title: string;
    url: string;
    metric?: string;
  }>;
  keywords: string[];
}

// ============================================================================
// AI Response Types
// ============================================================================

export interface ScoringResult {
  results: Array<{
    index: number;
    relevance: number;
    quality: number;
    timeliness: number;
    category: string;
    keywords: string[];
  }>;
}

export interface SummaryResult {
  results: Array<{
    index: number;
    titleZh: string;
    summary: string;
    reason: string;
  }>;
}

// ============================================================================
// AI Client Interface
// ============================================================================

export interface AIClient {
  call(prompt: string): Promise<string>;
}

// ============================================================================
// Feed Source
// ============================================================================

export interface FeedSource {
  name: string;
  xmlUrl: string;
  htmlUrl: string;
}

// ============================================================================
// CLI Config
// ============================================================================

export type ProviderId = 'glm' | 'openai' | 'deepseek' | 'kimi' | 'minimax' | 'gemini' | 'claude';

export interface CliConfig {
  provider: ProviderId;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  hours: number;
  topN: number;
  lang: 'zh' | 'en';
  output: string;
  noHotEvents: boolean;
}

// ============================================================================
// Report Stats
// ============================================================================

export interface ReportStats {
  totalFeeds: number;
  successFeeds: number;
  totalArticles: number;
  filteredArticles: number;
  hours: number;
  lang: string;
}
