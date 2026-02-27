import type { AIClient } from '../types.js';

export function createGeminiClient(
  apiKey: string,
  baseUrl: string,
  model: string,
): AIClient {
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  return {
    async call(prompt: string): Promise<string> {
      const url = `${normalizedBase}/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            topP: 0.8,
            topK: 40,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    },
  };
}
