import type { ScoredArticle, CategoryId, ReportStats, HotEvent } from './types.js';
import { CATEGORY_META } from './types.js';

// ============================================================================
// Time Helpers
// ============================================================================

function humanizeTime(pubDate: Date): string {
  const diffMs = Date.now() - pubDate.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return pubDate.toISOString().slice(0, 10);
}

// ============================================================================
// Mermaid Charts
// ============================================================================

function generateCategoryPieChart(articles: ScoredArticle[]): string {
  const catCount = new Map<CategoryId, number>();
  for (const a of articles) {
    catCount.set(a.category, (catCount.get(a.category) || 0) + 1);
  }

  if (catCount.size === 0) return '';

  const sorted = Array.from(catCount.entries()).sort((a, b) => b[1] - a[1]);

  let chart = '```mermaid\n';
  chart += `pie showData\n`;
  chart += `    title "文章分类分布"\n`;
  for (const [cat, count] of sorted) {
    const meta = CATEGORY_META[cat];
    chart += `    "${meta.emoji} ${meta.label}" : ${count}\n`;
  }
  chart += '```\n';

  return chart;
}

// ============================================================================
// Main Report Generator
// ============================================================================

export function generateDigestReport(articles: ScoredArticle[], highlights: string, hotEvents: HotEvent[], stats: ReportStats): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  let report = `# 📰 TrendPush 每日热点 — ${dateStr}\n\n`;
  report += `> 来自 Karpathy 推荐的 ${stats.totalFeeds} 个顶级技术博客，AI 精选 Top ${articles.length}\n\n`;

  // Today's Highlights
  if (highlights) {
    report += `## 📝 今日看点\n\n`;
    report += `${highlights}\n\n`;
    report += `---\n\n`;
  }

  // Hot Events
  if (hotEvents.length > 0) {
    report += `## 🔥 热门 AI 事件\n\n`;
    const significanceIcon: Record<string, string> = {
      breaking: '🔴 BREAKING',
      trending: '🟡 TRENDING',
      emerging: '🟢 EMERGING',
    };
    const sourceIcon: Record<string, string> = {
      hn: '🟠 HN',
      github: '🟣 GitHub',
      rss: '🔵 RSS',
    };

    for (let i = 0; i < hotEvents.length; i++) {
      const event = hotEvents[i]!;
      const badge = significanceIcon[event.significance] || '🟡 TRENDING';

      report += `### ${i + 1}. ${event.title} ${badge}\n\n`;
      report += `> ${event.summary}\n\n`;

      if (event.sources.length > 0) {
        for (const src of event.sources) {
          const icon = sourceIcon[src.type] || '📌';
          const metric = src.metric ? ` (${src.metric})` : '';
          report += `- ${icon}: [${src.title}](${src.url})${metric}\n`;
        }
        report += '\n';
      }

      if (event.keywords.length > 0) {
        report += `🏷️ ${event.keywords.join(', ')}\n\n`;
      }
    }

    report += `---\n\n`;
  }

  // Top 3 Deep Showcase
  if (articles.length >= 3) {
    report += `## 🏆 今日必读\n\n`;
    for (let i = 0; i < Math.min(3, articles.length); i++) {
      const a = articles[i]!;
      const medal = ['🥇', '🥈', '🥉'][i];
      const catMeta = CATEGORY_META[a.category];

      report += `${medal} **${a.titleZh || a.title}**\n\n`;
      report += `[${a.title}](${a.link}) — ${a.sourceName} · ${humanizeTime(a.pubDate)} · ${catMeta.emoji} ${catMeta.label}\n\n`;
      report += `> ${a.summary}\n\n`;
      if (a.reason) {
        report += `💡 **为什么值得读**: ${a.reason}\n\n`;
      }
      if (a.keywords.length > 0) {
        report += `🏷️ ${a.keywords.join(', ')}\n\n`;
      }
    }
    report += `---\n\n`;
  }


  // Category-Grouped Articles
  const categoryGroups = new Map<CategoryId, ScoredArticle[]>();
  for (const a of articles) {
    const list = categoryGroups.get(a.category) || [];
    list.push(a);
    categoryGroups.set(a.category, list);
  }

  const sortedCategories = Array.from(categoryGroups.entries())
    .sort((a, b) => {
      const maxScoreA = Math.max(...a[1].map(x => x.score));
      const maxScoreB = Math.max(...b[1].map(x => x.score));
      return maxScoreB - maxScoreA;
    });

  for (const [catId, catArticles] of sortedCategories) {
    const catMeta = CATEGORY_META[catId];
    report += `## ${catMeta.emoji} ${catMeta.label}\n\n`;

    for (let i = 0; i < catArticles.length; i++) {
      const a = catArticles[i]!;
      const scoreTotal = a.scoreBreakdown.relevance + a.scoreBreakdown.quality + a.scoreBreakdown.timeliness;

      report += `### ${i + 1}. ${a.titleZh || a.title}\n\n`;
      report += `[${a.title}](${a.link}) — **${a.sourceName}** · ${humanizeTime(a.pubDate)} · ⭐ ${scoreTotal}/30\n\n`;
      report += `> ${a.summary}\n\n`;
      if (a.keywords.length > 0) {
        report += `🏷️ ${a.keywords.join(', ')}\n\n`;
      }
      report += `---\n\n`;
    }
  }

  // Category Distribution
  const pieChart = generateCategoryPieChart(articles);
  if (pieChart) {
    report += `## 📊 分类分布\n\n${pieChart}\n`;
  }

  // Footer
  report += `*生成于 ${dateStr} ${now.toISOString().split('T')[1]?.slice(0, 5) || ''} | 扫描 ${stats.successFeeds} 源 → 获取 ${stats.totalArticles} 篇 → 精选 ${articles.length} 篇*\n`;
  report += `*基于 [Hacker News Popularity Contest 2025](https://refactoringenglish.com/tools/hn-popularity/) RSS 源列表，由 [Andrej Karpathy](https://x.com/karpathy) 推荐*\n`;

  return report;
}
