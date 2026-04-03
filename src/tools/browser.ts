// Browser tool — browser automation via Playwright

import type { ToolDefinition, EngineChunk } from "../types.js";
import { dispatch } from "./browser/actions.js";

export const BrowserTool: ToolDefinition = {
  name: "Browser",
  permissionLevel: "execute",
  description:
    "Control a browser to navigate web pages, interact with elements, fill forms, click buttons, and extract page content. The browser persists across calls within a session. Requires: npm install playwright-core (uses system Chrome; if unavailable, also run: npx playwright-core install chromium).",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "launch",
          "navigate",
          "click",
          "type",
          "select_option",
          "scroll",
          "execute_js",
          "get_content",
          "wait",
          "back",
          "forward",
          "close",
        ],
        description:
          "The browser action to perform. 'launch' starts the browser (auto-called if needed). 'navigate' goes to a URL. 'click' clicks an element. 'type' fills text into an input. 'select_option' picks a dropdown option. 'scroll' scrolls up/down. 'execute_js' runs JavaScript. 'get_content' extracts page content. 'wait' waits for an element. 'back'/'forward' navigate history. 'close' shuts down the browser.",
      },
      url: {
        type: "string",
        description: "URL for 'launch' (optional) and 'navigate' (required) actions",
      },
      selector: {
        type: "string",
        description:
          "CSS selector for 'click', 'type', 'select_option', and 'wait' actions. Use data-mcc-id attribute from get_content(format='dom') for precise targeting, e.g. '[data-mcc-id=\"5\"]'",
      },
      text: {
        type: "string",
        description: "Text to input for 'type' action",
      },
      value: {
        type: "string",
        description: "Option label to select for 'select_option' action",
      },
      direction: {
        type: "string",
        enum: ["up", "down"],
        description: "Scroll direction for 'scroll' action (default: 'down')",
      },
      script: {
        type: "string",
        description: "JavaScript code to execute for 'execute_js' action",
      },
      format: {
        type: "string",
        enum: ["text", "dom", "accessibility"],
        description:
          "Content format for 'get_content' action. 'text' returns plain text (default). 'dom' returns simplified DOM with numbered interactive elements. 'accessibility' returns the accessibility tree.",
      },
      timeout: {
        type: "number",
        description: "Timeout in ms for 'wait' action (default: 10000)",
      },
    },
    required: ["action"],
  },
  async execute(input) {
    return dispatch(input);
  },
  async *executeStreaming(input): AsyncGenerator<EngineChunk, string> {
    // Queue for progress messages from the async callback
    const queue: string[] = [];
    let resolve: (() => void) | null = null;
    let done = false;

    const dispatchPromise = dispatch(input, (msg) => {
      queue.push(msg);
      resolve?.();
    }).then((result) => {
      done = true;
      resolve?.();
      return result;
    });

    // Yield progress messages as they arrive, until dispatch completes
    while (!done) {
      if (queue.length > 0) {
        while (queue.length > 0) {
          yield { type: "tool", content: queue.shift()! + "\n" };
        }
      } else {
        // Wait for either a new message or completion
        await new Promise<void>((r) => { resolve = r; });
        resolve = null;
      }
    }
    // Drain any remaining messages
    while (queue.length > 0) {
      yield { type: "tool", content: queue.shift()! + "\n" };
    }

    return await dispatchPromise;
  },
};
