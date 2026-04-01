import type { ToolDefinition } from "../types.js";

/**
 * WebSearch - search the web and return summarized results.
 * Uses DuckDuckGo HTML search (no API key required).
 */
export const WebSearchTool: ToolDefinition = {
  name: "WebSearch",
  permissionLevel: "safe",
  description:
    "Search the web for information. Returns search results with titles, URLs, and snippets. Use this when you need to find information online, look up documentation, or research a topic.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return (default: 10)",
      },
    },
    required: ["query"],
  },
  async execute(input) {
    const query = input.query as string;
    const maxResults = (input.maxResults as number) || 10;

    if (!query) return "Error: query is required";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      // Use DuckDuckGo HTML search
      const encodedQuery = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "mini-claude-code/0.1.0",
          Accept: "text/html",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return `Error: Search request failed with HTTP ${response.status}`;
      }

      const html = await response.text();

      // Parse DuckDuckGo HTML results
      const results = parseDDGResults(html, maxResults);

      if (results.length === 0) {
        return `No results found for: ${query}`;
      }

      const formatted = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
        .join("\n\n");

      return `Search results for: ${query}\n\n${formatted}`;
    } catch (err: any) {
      if (err.name === "AbortError") {
        return "Error: Search request timed out after 15 seconds";
      }
      return `Error: ${err.message}`;
    }
  },
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function parseDDGResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Match result blocks: <a class="result__a" href="...">title</a> and <a class="result__snippet">snippet</a>
  const resultBlocks = html.split(/class="result\s/g).slice(1);

  for (const block of resultBlocks) {
    if (results.length >= maxResults) break;

    // Extract URL from result__a href
    const urlMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/);
    // Extract title from result__a content
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+(?:<[^>]+>[^<]*)*)<\/a>/);
    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

    if (urlMatch) {
      let url = urlMatch[1];
      // DuckDuckGo wraps URLs in redirect - extract actual URL
      const uddgMatch = url.match(/uddg=([^&]+)/);
      if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);

      const title = titleMatch
        ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
        : "(no title)";
      const snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
        : "";

      if (title && url) {
        results.push({ title, url, snippet });
      }
    }
  }

  return results;
}
