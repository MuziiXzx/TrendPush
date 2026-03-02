import type { AIClient, ProviderId } from '../types.js';
import { createOpenAICompatibleClient } from './openai-compatible.js';
import { createGeminiClient } from './gemini.js';
import { createClaudeClient } from './claude.js';

// ============================================================================
// Provider Presets
// ============================================================================

export const PROVIDER_PRESETS: Record<ProviderId, { baseUrl: string; model: string }> = {
  glm:      { baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4', model: 'glm-4.7' },
  openai:   { baseUrl: 'https://api.openai.com/v1',            model: 'gpt-4o-mini' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1',          model: 'deepseek-chat' },
  kimi:     { baseUrl: 'https://api.moonshot.cn/v1',            model: 'moonshot-v1-8k' },
  minimax:  { baseUrl: 'https://api.minimax.chat/v1',           model: 'MiniMax-Text-01' },
  gemini:   { baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0-flash' },
  claude:   { baseUrl: 'https://api.anthropic.com',             model: 'claude-sonnet-4-20250514' },
};

// ============================================================================
// Retry Wrapper
// ============================================================================

function withRetry(client: AIClient, maxRetries = 3): AIClient {
  return {
    async call(prompt: string): Promise<string> {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await client.call(prompt);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          // 4xx client errors (except 429 rate limit) are not retryable
          if (/\b(40[0-9])\b/.test(msg) && !/\b429\b/.test(msg)) throw error;
          if (attempt === maxRetries) throw error;
          const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
          console.warn(`[digest] AI call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${msg.slice(0, 100)}`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
      throw new Error('Unreachable');
    }
  };
}

// ============================================================================
// Factory
// ============================================================================

export function createAIClient(
  provider: ProviderId,
  apiKey: string,
  baseUrlOverride?: string,
  modelOverride?: string,
): AIClient {
  const preset = PROVIDER_PRESETS[provider];
  const baseUrl = baseUrlOverride || preset.baseUrl;
  const model = modelOverride || preset.model;

  console.log(`[digest] AI client: ${provider} (${baseUrl}, model=${model})`);

  let client: AIClient;
  switch (provider) {
    case 'gemini':
      client = createGeminiClient(apiKey, baseUrl, model);
      break;
    case 'claude':
      client = createClaudeClient(apiKey, baseUrl, model);
      break;
    default:
      // glm, openai, deepseek, kimi, minimax → all OpenAI-compatible
      client = createOpenAICompatibleClient(apiKey, baseUrl, model);
      break;
  }

  return withRetry(client);
}

// ============================================================================
// JSON Response Parser (shared utility)
// ============================================================================

export function parseJsonResponse<T>(text: string): T {
  let jsonText = text.trim();
  // Strip markdown code blocks if present
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return JSON.parse(jsonText) as T;
}
