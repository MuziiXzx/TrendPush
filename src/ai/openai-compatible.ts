import type { AIClient } from '../types.js';

export function createOpenAICompatibleClient(
  apiKey: string,
  baseUrl: string,
  model: string,
): AIClient {
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  return {
    async call(prompt: string): Promise<string> {
      const response = await fetch(`${normalizedBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          top_p: 0.8,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`OpenAI-compatible API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: {
            content?: string | Array<{ type?: string; text?: string }>;
          };
        }>;
      };

      const content = data.choices?.[0]?.message?.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .filter(item => item.type === 'text' && typeof item.text === 'string')
          .map(item => item.text)
          .join('\n');
      }
      return '';
    },
  };
}
