import type { ToolDefinition } from "../types.js";

export const WebFetchTool: ToolDefinition = {
  name: "WebFetch",
  permissionLevel: "safe",
  description:
    "Fetches content from a URL. Returns the text content of the page. Useful for reading documentation, API responses, or web page content.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch content from",
      },
      headers: {
        type: "object",
        description: "Optional HTTP headers to send with the request",
      },
    },
    required: ["url"],
  },
  async execute(input) {
    const url = input.url as string;
    const headers = (input.headers as Record<string, string>) || {};

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return "Error: Invalid URL format";
    }

    // Only allow http/https
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return `Error: Only http and https protocols are supported, got ${parsedUrl.protocol}`;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "mini-claude-code/0.1.0",
          Accept: "text/html,application/json,text/plain,*/*",
          ...headers,
        },
        signal: controller.signal,
        redirect: "follow",
      });

      if (!response.ok) {
        clearTimeout(timeout);
        return `Error: HTTP ${response.status} ${response.statusText}`;
      }

      const contentType = response.headers.get("content-type") || "";

      // Handle text-based content types
      if (
        contentType.includes("text/") ||
        contentType.includes("application/json") ||
        contentType.includes("application/xml") ||
        contentType.includes("application/javascript") ||
        contentType.includes("+json") ||
        contentType.includes("+xml")
      ) {
        // Read body with timeout still active
        let text = await response.text();
        clearTimeout(timeout);

        // Strip HTML tags for html pages (basic text extraction)
        if (contentType.includes("text/html")) {
          text = stripHtml(text);
        }

        // Truncate if too large
        const MAX_SIZE = 50000;
        if (text.length > MAX_SIZE) {
          text =
            text.slice(0, MAX_SIZE) +
            `\n\n... (truncated, ${text.length} total chars)`;
        }

        return text;
      }

      clearTimeout(timeout);
      return `Error: Unsupported content type: ${contentType}. Only text-based content is supported.`;
    } catch (err: any) {
      if (err.name === "AbortError") {
        return "Error: Request timed out after 30 seconds";
      }
      return `Error: ${err.message}`;
    }
  },
};

/** Basic HTML tag stripping and text extraction */
function stripHtml(html: string): string {
  // Truncate before regex to avoid catastrophic backtracking on huge pages
  const MAX_HTML = 200000;
  let h = html.length > MAX_HTML ? html.slice(0, MAX_HTML) : html;

  return (
    h
      // Remove script/style blocks (non-greedy with [^<]* fallback to avoid backtracking)
      .replace(/<script[^>]*>(?:[^<]|<(?!\/script>))*<\/script>/gi, "")
      .replace(/<style[^>]*>(?:[^<]|<(?!\/style>))*<\/style>/gi, "")
      // Remove HTML comments
      .replace(/<!--(?:[^-]|-(?!->))*-->/g, "")
      // Convert common block elements to newlines
      .replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      // Remove remaining tags
      .replace(/<[^>]+>/g, "")
      // Decode common HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      // Clean up whitespace
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
