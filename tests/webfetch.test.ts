import { describe, it, expect, beforeEach, vi } from "vitest";
import { WebFetchTool } from "../src/tools/webfetch.js";

// ─── Mock Setup ─────────────────────────────────────────────────────────────

vi.stubGlobal("fetch", vi.fn());

/** Convenience accessor — typed as a vitest mock so .mockResolvedValueOnce is available. */
function mockFetch() {
  return fetch as unknown as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tool Attributes ─────────────────────────────────────────────────────────

describe("WebFetchTool — tool attributes", () => {
  it("should_have_name_WebFetch_when_accessed", () => {
    expect(WebFetchTool.name).toBe("WebFetch");
  });

  it("should_have_permissionLevel_safe_when_accessed", () => {
    expect(WebFetchTool.permissionLevel).toBe("safe");
  });

  it("should_require_url_field_in_inputSchema_when_schema_is_inspected", () => {
    expect(WebFetchTool.inputSchema.required).toContain("url");
  });

  it("should_define_url_as_string_type_in_inputSchema_properties", () => {
    const properties = WebFetchTool.inputSchema.properties as Record<string, { type: string }>;
    expect(properties.url.type).toBe("string");
  });
});

// ─── URL Validation ──────────────────────────────────────────────────────────

describe("WebFetchTool — URL validation", () => {
  it("should_return_error_when_url_is_completely_invalid", async () => {
    const result = await WebFetchTool.execute({ url: "not-a-url" });

    expect(result).toBe("Error: Invalid URL format");
  });

  it("should_return_error_when_url_has_no_protocol", async () => {
    const result = await WebFetchTool.execute({ url: "example.com/page" });

    expect(result).toBe("Error: Invalid URL format");
  });

  it("should_return_error_when_url_uses_ftp_protocol", async () => {
    const result = await WebFetchTool.execute({ url: "ftp://example.com/file.txt" });

    expect(result).toContain("Error: Only http and https protocols are supported");
    expect(result).toContain("ftp:");
  });

  it("should_return_error_when_url_uses_file_protocol", async () => {
    const result = await WebFetchTool.execute({ url: "file:///etc/passwd" });

    expect(result).toContain("Error: Only http and https protocols are supported");
    expect(result).toContain("file:");
  });

  it("should_return_error_when_url_uses_javascript_protocol", async () => {
    const result = await WebFetchTool.execute({ url: "javascript:alert(1)" });

    expect(result).toContain("Error: Only http and https protocols are supported");
  });

  it("should_proceed_to_fetch_when_url_uses_http_protocol", async () => {
    mockFetch().mockResolvedValueOnce(
      new Response("hello", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );

    const result = await WebFetchTool.execute({ url: "http://example.com" });

    expect(result).toBe("hello");
  });

  it("should_proceed_to_fetch_when_url_uses_https_protocol", async () => {
    mockFetch().mockResolvedValueOnce(
      new Response("hello secure", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com" });

    expect(result).toBe("hello secure");
  });
});

// ─── HTTP Error Handling ─────────────────────────────────────────────────────

describe("WebFetchTool — HTTP error handling", () => {
  it("should_return_http_error_message_when_response_status_is_404", async () => {
    mockFetch().mockResolvedValueOnce(
      new Response("Not Found", {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "text/plain" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com/missing" });

    expect(result).toBe("Error: HTTP 404 Not Found");
  });

  it("should_return_http_error_message_when_response_status_is_500", async () => {
    mockFetch().mockResolvedValueOnce(
      new Response("Internal Server Error", {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "content-type": "text/plain" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com/broken" });

    expect(result).toBe("Error: HTTP 500 Internal Server Error");
  });

  it("should_return_timeout_error_when_request_is_aborted", async () => {
    mockFetch().mockRejectedValueOnce(
      Object.assign(new Error("The operation was aborted"), { name: "AbortError" })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com" });

    expect(result).toBe("Error: Request timed out after 30 seconds");
  });

  it("should_return_error_message_when_fetch_throws_network_error", async () => {
    mockFetch().mockRejectedValueOnce(new Error("Network failure"));

    const result = await WebFetchTool.execute({ url: "https://example.com" });

    expect(result).toBe("Error: Network failure");
  });
});

// ─── Content Type Handling ───────────────────────────────────────────────────

describe("WebFetchTool — content type handling", () => {
  it("should_return_plain_text_as_is_when_content_type_is_text_plain", async () => {
    mockFetch().mockResolvedValueOnce(
      new Response("plain text content", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com/text" });

    expect(result).toBe("plain text content");
  });

  it("should_return_json_as_is_when_content_type_is_application_json", async () => {
    const json = JSON.stringify({ key: "value", num: 42 });
    mockFetch().mockResolvedValueOnce(
      new Response(json, {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://api.example.com/data" });

    expect(result).toBe(json);
  });

  it("should_return_json_as_is_when_content_type_has_plus_json_suffix", async () => {
    const json = '{"type":"manifest"}';
    mockFetch().mockResolvedValueOnce(
      new Response(json, {
        status: 200,
        headers: { "content-type": "application/manifest+json" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com/manifest" });

    expect(result).toBe(json);
  });

  it("should_return_error_when_content_type_is_binary_image", async () => {
    mockFetch().mockResolvedValueOnce(
      new Response("binary data", {
        status: 200,
        headers: { "content-type": "image/png" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com/image.png" });

    expect(result).toContain("Error: Unsupported content type: image/png");
  });

  it("should_return_error_when_content_type_is_binary_pdf", async () => {
    mockFetch().mockResolvedValueOnce(
      new Response("pdf binary", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com/doc.pdf" });

    expect(result).toContain("Error: Unsupported content type: application/pdf");
  });
});

// ─── HTML Stripping ──────────────────────────────────────────────────────────

describe("WebFetchTool — HTML stripping (via execute)", () => {
  it("should_strip_html_tags_when_content_type_is_text_html", async () => {
    mockFetch().mockResolvedValueOnce(
      new Response("<html><body><p>Hello World</p></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com" });

    expect(result).toContain("Hello World");
    expect(result).not.toContain("<html>");
    expect(result).not.toContain("<body>");
    expect(result).not.toContain("<p>");
  });

  it("should_remove_script_blocks_entirely_when_html_contains_script_tags", async () => {
    const html = "<html><body><p>Visible</p><script>alert('xss')</script></body></html>";
    mockFetch().mockResolvedValueOnce(
      new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com" });

    expect(result).toContain("Visible");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("xss");
  });

  it("should_remove_style_blocks_entirely_when_html_contains_style_tags", async () => {
    const html = "<html><head><style>body { color: red; }</style></head><body><p>Text</p></body></html>";
    mockFetch().mockResolvedValueOnce(
      new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com" });

    expect(result).toContain("Text");
    expect(result).not.toContain("color: red");
    expect(result).not.toContain("<style>");
  });

  it("should_decode_amp_entity_when_html_contains_ampersand_entity", async () => {
    mockFetch().mockResolvedValueOnce(
      new Response("<p>Tom &amp; Jerry</p>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com" });

    expect(result).toContain("Tom & Jerry");
    expect(result).not.toContain("&amp;");
  });

  it("should_decode_lt_and_gt_entities_when_html_contains_angle_bracket_entities", async () => {
    mockFetch().mockResolvedValueOnce(
      new Response("<p>1 &lt; 2 &gt; 0</p>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com" });

    expect(result).toContain("1 < 2 > 0");
  });

  it("should_decode_quot_entity_when_html_contains_quote_entity", async () => {
    mockFetch().mockResolvedValueOnce(
      new Response("<p>She said &quot;hello&quot;</p>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com" });

    expect(result).toContain('She said "hello"');
  });

  it("should_decode_apos_entity_when_html_contains_apostrophe_entity", async () => {
    mockFetch().mockResolvedValueOnce(
      new Response("<p>It&#39;s fine</p>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com" });

    expect(result).toContain("It's fine");
  });

  it("should_decode_nbsp_entity_when_html_contains_non_breaking_space_entity", async () => {
    mockFetch().mockResolvedValueOnce(
      new Response("<p>word1&nbsp;word2</p>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com" });

    expect(result).toContain("word1 word2");
    expect(result).not.toContain("&nbsp;");
  });

  it("should_remove_html_comments_when_html_contains_comment_blocks", async () => {
    const html = "<p>Visible</p><!-- hidden comment --><p>Also visible</p>";
    mockFetch().mockResolvedValueOnce(
      new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com" });

    expect(result).toContain("Visible");
    expect(result).toContain("Also visible");
    expect(result).not.toContain("hidden comment");
    expect(result).not.toContain("<!--");
  });

  it("should_not_strip_html_when_content_type_is_text_plain", async () => {
    const raw = "<p>Not stripped</p>";
    mockFetch().mockResolvedValueOnce(
      new Response(raw, {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com/raw.txt" });

    expect(result).toBe(raw);
  });
});

// ─── Content Truncation ──────────────────────────────────────────────────────

describe("WebFetchTool — content truncation", () => {
  it("should_truncate_content_and_append_notice_when_response_exceeds_50000_chars", async () => {
    const longContent = "a".repeat(60000);
    mockFetch().mockResolvedValueOnce(
      new Response(longContent, {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com/big" });

    expect(typeof result).toBe("string");
    const text = result as string;
    expect(text).toContain("... (truncated, 60000 total chars)");
    // Truncated portion is exactly 50000 chars plus the notice suffix
    expect(text.startsWith("a".repeat(50000))).toBe(true);
  });

  it("should_return_full_content_without_truncation_when_response_is_exactly_50000_chars", async () => {
    const exactContent = "b".repeat(50000);
    mockFetch().mockResolvedValueOnce(
      new Response(exactContent, {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com/exact" });

    expect(result).toBe(exactContent);
    expect(result as string).not.toContain("truncated");
  });

  it("should_return_full_content_without_truncation_when_response_is_under_50000_chars", async () => {
    const shortContent = "hello world";
    mockFetch().mockResolvedValueOnce(
      new Response(shortContent, {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );

    const result = await WebFetchTool.execute({ url: "https://example.com/short" });

    expect(result).toBe(shortContent);
  });
});
