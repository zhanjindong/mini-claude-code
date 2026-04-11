// Computer tool — desktop automation via screencapture + cliclick + VLM

import type { ToolDefinition, EngineChunk } from "../types.js";
import { dispatch } from "./computer/actions.js";

export const ComputerTool: ToolDefinition = {
  name: "Computer",
  permissionLevel: "execute",
  description:
    "Control the computer desktop: take screenshots, inspect UI elements, move/click the mouse, type text, press keys, scroll, and drag. Uses accessibility APIs for fast screen understanding (free, ~100ms), with VLM screenshot analysis as fallback. 'inspect' reads the UI element tree without screenshots. 'find_element' searches for UI elements by name. Requires: macOS + cliclick (brew install cliclick).",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "list_apps",
          "activate_app",
          "screenshot",
          "inspect",
          "find_element",
          "mouse_move",
          "left_click",
          "right_click",
          "double_click",
          "drag",
          "type",
          "key",
          "scroll",
          "cursor_position",
        ],
        description:
          "The desktop action to perform. 'list_apps' lists all visible apps and their windows. 'activate_app' brings an app to the foreground (requires app_name). 'inspect' reads the UI element tree via accessibility APIs (fast, free — preferred over screenshot; optional app_name to target a specific app). 'find_element' searches for a UI element by name (optional app_name). 'screenshot' captures and analyzes the screen via VLM (slower, use when accessibility is insufficient). Other actions: 'mouse_move', 'left_click'/'right_click'/'double_click', 'drag', 'type', 'key', 'scroll', 'cursor_position'.",
      },
      x: {
        type: "number",
        description: "X coordinate for mouse actions (left_click, right_click, double_click, mouse_move)",
      },
      y: {
        type: "number",
        description: "Y coordinate for mouse actions",
      },
      text: {
        type: "string",
        description: "Text to input for 'type' action",
      },
      key: {
        type: "string",
        description:
          "Key or combo for 'key' action. Examples: 'enter', 'cmd+c', 'ctrl+shift+tab', 'escape'",
      },
      start_x: { type: "number", description: "Drag start X coordinate" },
      start_y: { type: "number", description: "Drag start Y coordinate" },
      end_x: { type: "number", description: "Drag end X coordinate" },
      end_y: { type: "number", description: "Drag end Y coordinate" },
      direction: {
        type: "string",
        enum: ["up", "down", "left", "right"],
        description: "Scroll direction (default: 'down')",
      },
      amount: {
        type: "number",
        description: "Scroll repeat count (default: 3)",
      },
      app_name: {
        type: "string",
        description: "Target application name for 'activate_app', 'inspect', 'find_element'. If omitted for inspect/find_element, uses the frontmost app. Use 'list_apps' first to see available app names.",
      },
      query: {
        type: "string",
        description: "Text to search for in UI elements (for 'find_element' action). Matches element titles, values, and descriptions.",
      },
      screenshot_after: {
        type: "boolean",
        description:
          "Whether to get screen context after the action (default: true). Uses accessibility tree first, falls back to VLM screenshot. Set to false for faster execution when feedback is not needed.",
      },
    },
    required: ["action"],
  },
  async execute(input) {
    return dispatch(input);
  },
  async *executeStreaming(input): AsyncGenerator<EngineChunk, string> {
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

    while (!done) {
      if (queue.length > 0) {
        while (queue.length > 0) {
          yield { type: "tool", content: queue.shift()! + "\n" };
        }
      } else {
        await new Promise<void>((r) => {
          resolve = r;
        });
        resolve = null;
      }
    }
    while (queue.length > 0) {
      yield { type: "tool", content: queue.shift()! + "\n" };
    }

    return await dispatchPromise;
  },
};
