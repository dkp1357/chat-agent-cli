// tavily is designed for ai agents, provides 1500 queries per month in free tier

import { tool } from "ai";
import { z } from "zod";
import { config } from "../config.js"

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function tavilySearch(query: string): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.tavilyApiKey,
      query,
      search_depth: 'basic',
      max_results: 6,
      include_answer: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tavily API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      title: string;
      url: string;
      content: string;
    }>;
  };

  return (
    data.results?.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    })) ?? []
  );
}

export const webSearchTool = tool({
  description: `Search the web for current, real-time information. Use this tool when you need:
• Current pricing, plans, or feature lists for products and services
• Recent news, announcements, or changelog entries
• Verification of facts that may have changed since your training data
• Any information the user is asking about in a "has X changed" context

Guidelines:
• Write specific, targeted queries — include product names, version numbers, "pricing 2026", etc.
• When checking multiple products (e.g. "5 CRM tools"), call this tool once per product for thorough results.
• When verifying if something changed, search for "[product] pricing" or "[product] changelog [year]".
• Always cite sources (URLs) in your response.`,

  inputSchema: z.object({
    query: z.string().describe(
      'A specific, well-formed search query. Include product names, dates, and relevant keywords.'
    ),
  }),

  execute: async ({ query }): Promise<SearchResult[]> => {
    return await tavilySearch(query);
  },
});