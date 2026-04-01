import type { ToolDefinition } from "../types.js";

/**
 * WebSearch - search the web and return summarized results.
 * Uses Bing HTML search (no API key required).
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

      // Use Bing HTML search
      const encodedQuery = encodeURIComponent(query);
      const url = `https://cn.bing.com/search?q=${encodedQuery}&count=${maxResults}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return `Error: Search request failed with HTTP ${response.status}`;
      }

      const html = await response.text();

      // Parse Bing HTML results
      const results = parseBingResults(html, maxResults);

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

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

function parseBingResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Split by Bing's result block class
  const blocks = html.split(/class="b_algo"/).slice(1);

  for (const block of blocks) {
    if (results.length >= maxResults) break;

    // Extract URL and title from <h2><a href="...">Title</a></h2>
    const linkMatch = block.match(/<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;

    const url = linkMatch[1];
    const title = decodeHtmlEntities(stripHtmlTags(linkMatch[2])).trim();

    // Extract snippet from <p class="b_lineclamp...">...</p>
    const snippetMatch = block.match(/class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const snippet = snippetMatch
      ? decodeHtmlEntities(stripHtmlTags(snippetMatch[1])).trim()
      : "";

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}
