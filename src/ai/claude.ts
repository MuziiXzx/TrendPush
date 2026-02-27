import type { AIClient } from '../types.js';

export function createClaudeClient(
  apiKey: string,
  baseUrl: string,
  model: string,
): AIClient {
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  return {
    async call(prompt: string): Promise<string> {
      const response = await fetch(`${normalizedBase}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Claude API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as {
        content?: Array<{ type: string; text?: string }>;
      };

      return data.content
        ?.filter(block => block.type === 'text' && typeof block.text === 'string')
        .map(block => block.text)
        .join('\n') || '';
    },
  };
}
