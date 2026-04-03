// Computer tool — desktop automation via screencapture + cliclick + VLM

import type { ToolDefinition, EngineChunk } from "../types.js";
import { dispatch } from "./computer/actions.js";

export const ComputerTool: ToolDefinition = {
  name: "Computer",
  permissionLevel: "execute",
  description:
    "Control the computer desktop: take screenshots, move/click the mouse, type text, press keys, scroll, and drag. Screenshots are automatically analyzed by a vision model to describe screen content. Requires: macOS + cliclick (brew install cliclick). Set MCC_API_KEY for VLM screenshot analysis.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "screenshot",
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
          "The desktop action to perform. 'screenshot' captures and analyzes the screen. 'mouse_move' moves the cursor. 'left_click'/'right_click'/'double_click' click at coordinates. 'drag' drags between two points. 'type' inputs text. 'key' presses keys/combos (e.g. 'cmd+c', 'enter'). 'scroll' scrolls in a direction. 'cursor_position' reports current cursor location.",
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
      screenshot_after: {
        type: "boolean",
        description:
          "Whether to take and analyze a screenshot after the action (default: true). Set to false for faster execution when visual feedback is not needed.",
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
