// DOM content extraction strategies for browser pages
// Uses 'any' for Page type since playwright is optional

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_OUTPUT_CHARS = 30000;
const MAX_TEXT_PER_NODE = 200;

/** Extract plain text content from the page */
export async function extractText(page: any): Promise<string> {
  let text: string = await page.innerText("body");
  if (text.length > MAX_OUTPUT_CHARS) {
    text = text.slice(0, MAX_OUTPUT_CHARS) + "\n\n... (truncated)";
  }
  return text;
}

/** Extract simplified DOM tree with numbered interactive elements */
export async function extractDom(page: any): Promise<string> {
  const result: string = await page.evaluate(
    ({ maxText }: { maxText: number }) => {
      let idCounter = 0;
      const SKIP_TAGS = new Set([
        "SCRIPT",
        "STYLE",
        "NOSCRIPT",
        "SVG",
        "PATH",
      ]);
      const INTERACTIVE_TAGS = new Set([
        "A",
        "BUTTON",
        "INPUT",
        "TEXTAREA",
        "SELECT",
        "OPTION",
        "LABEL",
        "DETAILS",
        "SUMMARY",
      ]);

      function isVisible(el: Element): boolean {
        const style = window.getComputedStyle(el);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0"
        );
      }

      function truncate(s: string, max: number): string {
        const cleaned = s.replace(/\s+/g, " ").trim();
        return cleaned.length > max
          ? cleaned.slice(0, max) + "..."
          : cleaned;
      }

      function processNode(node: Node, depth: number): string {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = (node.textContent || "").trim();
          return text ? truncate(text, maxText) : "";
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return "";

        const el = node as Element;
        if (SKIP_TAGS.has(el.tagName)) return "";
        if (!isVisible(el)) return "";

        const isInteractive =
          INTERACTIVE_TAGS.has(el.tagName) ||
          el.hasAttribute("role") ||
          el.hasAttribute("onclick") ||
          el.hasAttribute("contenteditable");

        const indent = "  ".repeat(depth);
        const lines: string[] = [];
        const tag = el.tagName.toLowerCase();

        // Build attribute string for interactive elements
        let attrs = "";
        if (isInteractive) {
          const id = ++idCounter;
          el.setAttribute("data-mcc-id", String(id));

          const relevantAttrs = [
            "href",
            "type",
            "name",
            "placeholder",
            "value",
            "role",
            "aria-label",
          ];
          const attrParts = relevantAttrs
            .filter((a) => el.hasAttribute(a))
            .map((a) => `${a}="${truncate(el.getAttribute(a)!, 80)}"`)
            .join(" ");

          attrs = attrParts ? ` ${attrParts}` : "";
          const prefix = `[${id}] `;

          // Self-closing or leaf interactive elements
          const text = truncate(el.textContent || "", maxText);
          if (
            el.tagName === "INPUT" ||
            el.tagName === "SELECT" ||
            !el.children.length
          ) {
            lines.push(
              `${indent}${prefix}<${tag}${attrs}>${text ? " " + text : ""}</${tag}>`
            );
          } else {
            lines.push(`${indent}${prefix}<${tag}${attrs}>`);
            // Process children
            for (const child of el.childNodes) {
              const childResult = processNode(child, depth + 1);
              if (childResult) lines.push(childResult);
            }
            lines.push(`${indent}</${tag}>`);
          }
        } else {
          // Non-interactive: only include if has interactive descendants or meaningful text
          const hasInteractiveChild = el.querySelector(
            "a, button, input, textarea, select, [role], [onclick]"
          );
          const directText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => (n.textContent || "").trim())
            .join(" ")
            .trim();

          if (hasInteractiveChild || (directText && depth <= 4)) {
            // Structural containers or text-bearing elements
            if (
              ["NAV", "MAIN", "HEADER", "FOOTER", "SECTION", "FORM", "DIV", "UL", "OL", "LI", "TABLE", "TR", "TD", "TH", "H1", "H2", "H3", "H4", "H5", "H6", "P", "SPAN"].includes(el.tagName)
            ) {
              const childResults: string[] = [];
              for (const child of el.childNodes) {
                const r = processNode(child, depth + 1);
                if (r) childResults.push(r);
              }
              if (childResults.length) {
                lines.push(`${indent}<${tag}>`);
                lines.push(...childResults);
                lines.push(`${indent}</${tag}>`);
              } else if (directText) {
                lines.push(
                  `${indent}<${tag}>${truncate(directText, maxText)}</${tag}>`
                );
              }
            } else {
              // Other elements: just process children
              for (const child of el.childNodes) {
                const r = processNode(child, depth + 1);
                if (r) lines.push(r);
              }
            }
          }
        }

        return lines.join("\n");
      }

      return processNode(document.body, 0);
    },
    { maxText: MAX_TEXT_PER_NODE }
  );

  if (result.length > MAX_OUTPUT_CHARS) {
    return result.slice(0, MAX_OUTPUT_CHARS) + "\n\n... (truncated)";
  }
  return result || "(empty page)";
}

/** Extract accessibility tree snapshot */
export async function extractAccessibility(page: any): Promise<string> {
  const snapshot = await page.accessibility.snapshot();
  if (!snapshot) return "(no accessibility tree available)";

  function serialize(node: any, depth: number): string {
    const indent = "  ".repeat(depth);
    const parts: string[] = [];
    const role = node.role || "unknown";
    const name = node.name ? ` "${node.name}"` : "";
    const value = node.value ? ` value="${node.value}"` : "";
    const checked =
      node.checked !== undefined ? ` checked=${node.checked}` : "";
    const selected =
      node.selected !== undefined ? ` selected=${node.selected}` : "";

    parts.push(`${indent}[${role}]${name}${value}${checked}${selected}`);

    if (node.children) {
      for (const child of node.children) {
        parts.push(serialize(child, depth + 1));
      }
    }
    return parts.join("\n");
  }

  let result = serialize(snapshot, 0);
  if (result.length > MAX_OUTPUT_CHARS) {
    result = result.slice(0, MAX_OUTPUT_CHARS) + "\n\n... (truncated)";
  }
  return result;
}
