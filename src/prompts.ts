// ============================================================================
// Scoring Prompt
// ============================================================================

export function buildScoringPrompt(articles: Array<{ index: number; title: string; description: string; sourceName: string }>): string {
  const articlesList = articles.map(a =>
    `Index ${a.index}: [${a.sourceName}] ${a.title}\n${a.description.slice(0, 300)}`
  ).join('\n\n---\n\n');

  return `你是一个技术内容策展人，正在为一份面向技术爱好者的每日精选摘要筛选文章。

请对以下文章进行三个维度的评分（1-10 整数，10 分最高），并为每篇文章分配一个分类标签和提取 2-4 个关键词。

## 评分维度

### 1. 相关性 (relevance) - 对技术/编程/AI/互联网从业者的价值
- 10: 所有技术人都应该知道的重大事件/突破
- 7-9: 对大部分技术从业者有价值
- 4-6: 对特定技术领域有价值
- 1-3: 与技术行业关联不大

### 2. 质量 (quality) - 文章本身的深度和写作质量
- 10: 深度分析，原创洞见，引用丰富
- 7-9: 有深度，观点独到
- 4-6: 信息准确，表达清晰
- 1-3: 浅尝辄止或纯转述

### 3. 时效性 (timeliness) - 当前是否值得阅读
- 10: 正在发生的重大事件/刚发布的重要工具
- 7-9: 近期热点相关
- 4-6: 常青内容，不过时
- 1-3: 过时或无时效价值

## 分类标签（必须从以下选一个）
- ai-ml: AI、机器学习、LLM、深度学习相关
- security: 安全、隐私、漏洞、加密相关
- engineering: 软件工程、架构、编程语言、系统设计
- tools: 开发工具、开源项目、新发布的库/框架
- opinion: 行业观点、个人思考、职业发展、文化评论
- other: 以上都不太适合的

## 关键词提取
提取 2-4 个最能代表文章主题的关键词（用英文，简短，如 "Rust", "LLM", "database", "performance"）

## 待评分文章

${articlesList}

请严格按 JSON 格式返回，不要包含 markdown 代码块或其他文字：
{
  "results": [
    {
      "index": 0,
      "relevance": 8,
      "quality": 7,
      "timeliness": 9,
      "category": "engineering",
      "keywords": ["Rust", "compiler", "performance"]
    }
  ]
}`;
}

// ============================================================================
// Summary Prompt
// ============================================================================

export function buildSummaryPrompt(
  articles: Array<{ index: number; title: string; description: string; sourceName: string; link: string }>,
  lang: 'zh' | 'en',
): string {
  const articlesList = articles.map(a =>
    `Index ${a.index}: [${a.sourceName}] ${a.title}\nURL: ${a.link}\n${a.description.slice(0, 800)}`
  ).join('\n\n---\n\n');

  const langInstruction = lang === 'zh'
    ? '请用中文撰写摘要和推荐理由。如果原文是英文，请翻译为中文。标题翻译也用中文。'
    : 'Write summaries, reasons, and title translations in English.';

  return `你是一个技术内容摘要专家。请为以下文章完成三件事：

1. **中文标题** (titleZh): 将英文标题翻译成自然的中文。如果原标题已经是中文则保持不变。
2. **摘要** (summary): 4-6 句话的结构化摘要，让读者不点进原文也能了解核心内容。包含：
   - 文章讨论的核心问题或主题（1 句）
   - 关键论点、技术方案或发现（2-3 句）
   - 结论或作者的核心观点（1 句）
3. **推荐理由** (reason): 1 句话说明"为什么值得读"，区别于摘要（摘要说"是什么"，推荐理由说"为什么"）。

${langInstruction}

摘要要求：
- 直接说重点，不要用"本文讨论了..."、"这篇文章介绍了..."这种开头
- 包含具体的技术名词、数据、方案名称或观点
- 保留关键数字和指标（如性能提升百分比、用户数、版本号等）
- 如果文章涉及对比或选型，要点出比较对象和结论
- 目标：读者花 30 秒读完摘要，就能决定是否值得花 10 分钟读原文

## 待摘要文章

${articlesList}

请严格按 JSON 格式返回：
{
  "results": [
    {
      "index": 0,
      "titleZh": "中文翻译的标题",
      "summary": "摘要内容...",
      "reason": "推荐理由..."
    }
  ]
}`;
}

// ============================================================================
// Highlights / Trend Prompt
// ============================================================================

// ============================================================================
// Hot Events Synthesis Prompt
// ============================================================================

export function buildHotEventsPrompt(
  hnStories: Array<{ title: string; url: string; score: number; commentCount: number }>,
  githubRepos: Array<{ name: string; url: string; description: string; stars: number; language: string }>,
  rssClusters: Array<{ keyword: string; articles: Array<{ title: string; link: string; sourceName: string; score: number }> }>,
  lang: 'zh' | 'en',
): string {
  const langNote = lang === 'zh'
    ? '请用中文生成事件标题和描述。'
    : 'Generate event titles and summaries in English.';

  let hnSection = '';
  if (hnStories.length > 0) {
    hnSection = `### Hacker News 热帖\n\n` + hnStories.map((s, i) =>
      `${i + 1}. [${s.score} points, ${s.commentCount} comments] ${s.title}\n   ${s.url}`
    ).join('\n') + '\n\n';
  }

  let ghSection = '';
  if (githubRepos.length > 0) {
    ghSection = `### GitHub 热门新仓库\n\n` + githubRepos.map((r, i) =>
      `${i + 1}. [${r.stars} stars, ${r.language}] ${r.name}: ${r.description}\n   ${r.url}`
    ).join('\n') + '\n\n';
  }

  let rssSection = '';
  if (rssClusters.length > 0) {
    rssSection = `### RSS 热点聚类\n\n` + rssClusters.map((c, i) => {
      const arts = c.articles.map(a => `  - [score ${a.score}] ${a.sourceName}: ${a.title}`).join('\n');
      return `${i + 1}. 关键词: "${c.keyword}" (${c.articles.length} 篇相关文章)\n${arts}`;
    }).join('\n\n') + '\n\n';
  }

  return `你是一个技术趋势分析师。请根据以下来自三个不同来源的数据，识别出当前最热门的 AI/技术事件。

${langNote}

## 数据来源

${hnSection}${ghSection}${rssSection}

## 任务

1. 从上述数据中识别 3-8 个热门事件
2. 每个事件可能跨多个来源出现（如 HN 上有讨论、GitHub 上有项目、RSS 博客有评测）
3. 合并相关条目，生成事件级别的标题和描述
4. 判定每个事件的热度等级：
   - "breaking": 正在爆发的重大事件，多来源同时关注
   - "trending": 明显的上升趋势，关注度较高
   - "emerging": 新出现的值得关注的趋势

## 输出格式

请严格按 JSON 格式返回，不要包含 markdown 代码块或其他文字：
{
  "events": [
    {
      "title": "事件标题",
      "summary": "1-2 句描述",
      "significance": "breaking",
      "sources": [
        { "type": "hn", "title": "原始标题", "url": "...", "metric": "847 points" },
        { "type": "github", "title": "repo/name", "url": "...", "metric": "2.3k stars" },
        { "type": "rss", "title": "来源: 文章标题", "url": "...", "metric": "score 27/30" }
      ],
      "keywords": ["keyword1", "keyword2"]
    }
  ]
}`;
}

// ============================================================================
// Highlights / Trend Prompt
// ============================================================================

export function buildHighlightsPrompt(
  articleList: string,
  lang: 'zh' | 'en',
): string {
  const langNote = lang === 'zh' ? '用中文回答。' : 'Write in English.';

  return `根据以下今日精选技术文章列表，写一段 3-5 句话的"今日看点"总结。
要求：
- 提炼出今天技术圈的 2-3 个主要趋势或话题
- 不要逐篇列举，要做宏观归纳
- 风格简洁有力，像新闻导语
${langNote}

文章列表：
${articleList}

直接返回纯文本总结，不要 JSON，不要 markdown 格式。`;
}
