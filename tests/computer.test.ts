import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseKeyCombo } from "../src/tools/computer/key-mapping.js";
import { setDriver, getTerminalAppName, detectPermissionError, type DesktopDriver } from "../src/tools/computer/platform.js";
import { dispatch } from "../src/tools/computer/actions.js";
import { resetVlmClient } from "../src/tools/computer/vlm.js";

// --- key-mapping tests ---

describe("parseKeyCombo", () => {
  it("parses single key", () => {
    expect(parseKeyCombo("enter")).toEqual(["kp:return"]);
    expect(parseKeyCombo("space")).toEqual(["kp:space"]);
    expect(parseKeyCombo("a")).toEqual(["kp:a"]);
  });

  it("parses escape variants", () => {
    expect(parseKeyCombo("escape")).toEqual(["kp:escape"]);
    expect(parseKeyCombo("esc")).toEqual(["kp:escape"]);
  });

  it("parses modifier + key", () => {
    expect(parseKeyCombo("cmd+c")).toEqual(["kd:cmd", "kp:c", "ku:cmd"]);
    expect(parseKeyCombo("ctrl+a")).toEqual(["kd:ctrl", "kp:a", "ku:ctrl"]);
  });

  it("parses multiple modifiers", () => {
    expect(parseKeyCombo("ctrl+shift+tab")).toEqual([
      "kd:ctrl",
      "kd:shift",
      "kp:tab",
      "ku:shift",
      "ku:ctrl",
    ]);
  });

  it("parses arrow keys", () => {
    expect(parseKeyCombo("up")).toEqual(["kp:arrow-up"]);
    expect(parseKeyCombo("down")).toEqual(["kp:arrow-down"]);
    expect(parseKeyCombo("left")).toEqual(["kp:arrow-left"]);
    expect(parseKeyCombo("right")).toEqual(["kp:arrow-right"]);
  });

  it("handles backspace and delete", () => {
    expect(parseKeyCombo("backspace")).toEqual(["kp:delete"]);
    expect(parseKeyCombo("delete")).toEqual(["kp:fwd-delete"]);
  });

  it("is case-insensitive", () => {
    expect(parseKeyCombo("CMD+C")).toEqual(["kd:cmd", "kp:c", "ku:cmd"]);
    expect(parseKeyCombo("Enter")).toEqual(["kp:return"]);
  });

  it("handles command alias", () => {
    expect(parseKeyCombo("command+v")).toEqual(["kd:cmd", "kp:v", "ku:cmd"]);
  });
});

// --- Mock driver for action tests ---

function createMockDriver(): DesktopDriver & { calls: Array<{ method: string; args: any[] }> } {
  const calls: Array<{ method: string; args: any[] }> = [];

  const record = (method: string) => (...args: any[]) => {
    calls.push({ method, args });
    return Promise.resolve();
  };

  return {
    calls,
    screenshot: vi.fn().mockResolvedValue({
      base64: "fakeBase64",
      width: 1280,
      height: 800,
    }),
    mouseMove: vi.fn(record("mouseMove")),
    leftClick: vi.fn(record("leftClick")),
    rightClick: vi.fn(record("rightClick")),
    doubleClick: vi.fn(record("doubleClick")),
    drag: vi.fn(record("drag")),
    typeText: vi.fn(record("typeText")),
    keyPress: vi.fn(record("keyPress")),
    scroll: vi.fn(record("scroll")),
    getScreenSize: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
    getCursorPosition: vi.fn().mockResolvedValue({ x: 100, y: 200 }),
  };
}

// --- Mock config for VLM tests ---

vi.mock("../src/config.js", () => {
  let _config: any = {
    provider: "minimax",
    model: "MiniMax-M2.5",
    maxTokens: 8192,
    baseURL: "",
    permissions: {},
    toolPaths: [],
    apiKey: "",
    vlmProvider: "",
    vlmModel: "",
    vlmApiKey: "",
    vlmBaseURL: "",
  };
  return {
    getConfig: () => _config,
    loadConfig: () => _config,
    saveUserConfig: vi.fn(),
    __setMockConfig: (patch: any) => {
      _config = { ..._config, ...patch };
    },
    __resetMockConfig: () => {
      _config = {
        provider: "minimax",
        model: "MiniMax-M2.5",
        maxTokens: 8192,
        baseURL: "",
        permissions: {},
        toolPaths: [],
        apiKey: "",
        vlmProvider: "",
        vlmModel: "",
        vlmApiKey: "",
        vlmBaseURL: "",
      };
    },
  };
});

// Import mock helpers
const { __setMockConfig, __resetMockConfig } = await import("../src/config.js") as any;

// --- action dispatch tests ---

describe("Computer actions", () => {
  let mockDriver: ReturnType<typeof createMockDriver>;

  beforeEach(() => {
    mockDriver = createMockDriver();
    setDriver(mockDriver);
    __resetMockConfig();
    resetVlmClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error for missing action", async () => {
    const result = await dispatch({});
    expect(result).toContain("Error");
    expect(result).toContain("action");
  });

  it("returns error for unknown action", async () => {
    const result = await dispatch({ action: "fly" });
    expect(result).toContain("Error");
    expect(result).toContain("Unknown action");
  });

  it("screenshot action calls driver.screenshot", async () => {
    const result = await dispatch({ action: "screenshot" });
    expect(mockDriver.screenshot).toHaveBeenCalled();
    expect(result).toContain("1280x800");
    expect(result).toContain("VLM 未配置");
  });

  it("mouse_move action", async () => {
    const result = await dispatch({ action: "mouse_move", x: 100, y: 200 });
    expect(mockDriver.mouseMove).toHaveBeenCalledWith(100, 200);
    expect(result).toContain("(100, 200)");
  });

  it("left_click action with screenshot_after=false", async () => {
    const result = await dispatch({
      action: "left_click",
      x: 50,
      y: 75,
      screenshot_after: false,
    });
    expect(mockDriver.leftClick).toHaveBeenCalledWith(50, 75);
    expect(result).toBe("Clicked at (50, 75)");
    expect(mockDriver.screenshot).not.toHaveBeenCalled();
  });

  it("left_click action with default screenshot_after", async () => {
    const result = await dispatch({ action: "left_click", x: 50, y: 75 });
    expect(mockDriver.leftClick).toHaveBeenCalledWith(50, 75);
    // screenshot is called because screenshot_after defaults to true
    expect(mockDriver.screenshot).toHaveBeenCalled();
    expect(result).toContain("Clicked at (50, 75)");
  });

  it("right_click action", async () => {
    const result = await dispatch({
      action: "right_click",
      x: 300,
      y: 400,
      screenshot_after: false,
    });
    expect(mockDriver.rightClick).toHaveBeenCalledWith(300, 400);
    expect(result).toContain("Right-clicked");
  });

  it("double_click action", async () => {
    const result = await dispatch({
      action: "double_click",
      x: 10,
      y: 20,
      screenshot_after: false,
    });
    expect(mockDriver.doubleClick).toHaveBeenCalledWith(10, 20);
    expect(result).toContain("Double-clicked");
  });

  it("drag action", async () => {
    const result = await dispatch({
      action: "drag",
      start_x: 10,
      start_y: 20,
      end_x: 100,
      end_y: 200,
      screenshot_after: false,
    });
    expect(mockDriver.drag).toHaveBeenCalledWith(10, 20, 100, 200);
    expect(result).toContain("Dragged");
  });

  it("type action", async () => {
    const result = await dispatch({ action: "type", text: "hello world" });
    expect(mockDriver.typeText).toHaveBeenCalledWith("hello world");
    expect(result).toContain("hello world");
  });

  it("key action", async () => {
    const result = await dispatch({ action: "key", key: "cmd+c" });
    expect(mockDriver.keyPress).toHaveBeenCalledWith("cmd+c");
    expect(result).toContain("cmd+c");
  });

  it("scroll action", async () => {
    const result = await dispatch({
      action: "scroll",
      direction: "up",
      amount: 5,
      screenshot_after: false,
    });
    expect(mockDriver.scroll).toHaveBeenCalledWith("up", 5);
    expect(result).toContain("Scrolled up");
  });

  it("cursor_position action", async () => {
    const result = await dispatch({ action: "cursor_position" });
    expect(mockDriver.getCursorPosition).toHaveBeenCalled();
    expect(result).toContain("(100, 200)");
  });
});

// --- VLM integration tests ---

describe("Computer VLM integration", () => {
  let mockDriver: ReturnType<typeof createMockDriver>;

  beforeEach(() => {
    mockDriver = createMockDriver();
    setDriver(mockDriver);
    resetVlmClient();
  });

  afterEach(() => {
    __resetMockConfig();
    resetVlmClient();
    vi.restoreAllMocks();
  });

  it("shows unconfigured message when no VLM apiKey", async () => {
    __setMockConfig({ vlmProvider: "", vlmApiKey: "", apiKey: "" });
    const result = await dispatch({ action: "screenshot" });
    expect(result).toContain("VLM 未配置");
    expect(result).toContain("/model vlm");
  });

  describe("MiniMax proprietary protocol", () => {
    beforeEach(() => {
      __setMockConfig({ vlmProvider: "minimax-vlm", vlmApiKey: "test-vlm-key" });
      resetVlmClient();
    });

    it("calls MiniMax /v1/coding_plan/vlm endpoint", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ content: "Screen shows a desktop with Finder window" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await dispatch({ action: "screenshot" });
      expect(fetchSpy).toHaveBeenCalled();

      // Verify the request URL and body format
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain("/v1/coding_plan/vlm");
      const body = JSON.parse((opts as any).body);
      expect(body).toHaveProperty("prompt");
      expect(body).toHaveProperty("image_url");
      expect(body.image_url).toContain("data:image/png;base64,");

      expect(result).toContain("Screen shows a desktop with Finder window");
    });

    it("handles MiniMax API failure gracefully", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Internal Server Error", { status: 500 })
      );

      const result = await dispatch({ action: "screenshot" });
      expect(result).toContain("截图分析失败");
      expect(result).toContain("500");
    });

    it("handles MiniMax network error gracefully", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

      const result = await dispatch({ action: "screenshot" });
      expect(result).toContain("截图分析失败");
      expect(result).toContain("Network error");
    });
  });

  describe("OpenAI Vision protocol", () => {
    beforeEach(() => {
      __setMockConfig({ vlmProvider: "openai", vlmApiKey: "test-openai-key", vlmModel: "gpt-4o" });
      resetVlmClient();
    });

    it("calls OpenAI chat completions with image_url", async () => {
      // Mock the analyzeScreenshot to verify it's called with correct args
      const vlmModule = await import("../src/tools/computer/vlm.js");
      const spy = vi.spyOn(vlmModule, "analyzeScreenshot").mockResolvedValue("Desktop with VS Code open");

      const result = await dispatch({ action: "screenshot" });
      expect(spy).toHaveBeenCalled();
      const [base64, prompt] = spy.mock.calls[0];
      expect(base64).toBe("fakeBase64");
      expect(prompt).toContain("Describe");
      expect(result).toContain("Desktop with VS Code open");

      spy.mockRestore();
    });

    it("handles OpenAI API failure gracefully", async () => {
      const vlmModule = await import("../src/tools/computer/vlm.js");
      const spy = vi.spyOn(vlmModule, "analyzeScreenshot").mockResolvedValue("[截图分析失败: API Error]");

      const result = await dispatch({ action: "screenshot" });
      expect(result).toContain("截图分析失败");
      expect(result).toContain("API Error");

      spy.mockRestore();
    });
  });
});

// --- Permission error detection tests ---

describe("Permission error detection", () => {
  const originalTermProgram = process.env.TERM_PROGRAM;

  afterEach(() => {
    if (originalTermProgram !== undefined) {
      process.env.TERM_PROGRAM = originalTermProgram;
    } else {
      delete process.env.TERM_PROGRAM;
    }
  });

  describe("getTerminalAppName", () => {
    it("returns iTerm2 for iTerm.app", () => {
      process.env.TERM_PROGRAM = "iTerm.app";
      expect(getTerminalAppName()).toBe("iTerm2");
    });

    it("returns VS Code for vscode", () => {
      process.env.TERM_PROGRAM = "vscode";
      expect(getTerminalAppName()).toBe("VS Code");
    });

    it("returns Terminal for Apple_Terminal", () => {
      process.env.TERM_PROGRAM = "Apple_Terminal";
      expect(getTerminalAppName()).toBe("Terminal");
    });

    it("returns Warp for WarpTerminal", () => {
      process.env.TERM_PROGRAM = "WarpTerminal";
      expect(getTerminalAppName()).toBe("Warp");
    });

    it("returns generic name for unknown terminal", () => {
      process.env.TERM_PROGRAM = "some-unknown-terminal";
      expect(getTerminalAppName()).toBe("your terminal app");
    });

    it("returns generic name when TERM_PROGRAM is unset", () => {
      delete process.env.TERM_PROGRAM;
      expect(getTerminalAppName()).toBe("your terminal app");
    });
  });

  describe("detectPermissionError", () => {
    it("returns Screen Recording hint for screencapture errors", () => {
      const err = new Error("Command failed");
      const result = detectPermissionError(err, "screencapture");
      expect(result).toContain("Screen Recording permission required");
      expect(result).toContain("System Settings");
      expect(result).toContain("Screen Recording");
    });

    it("returns Accessibility hint for cliclick accessibility errors", () => {
      const err = { message: "cliclick failed", stderr: "not trusted for accessibility" };
      const result = detectPermissionError(err, "cliclick");
      expect(result).toContain("Accessibility permission required");
      expect(result).toContain("System Settings");
      expect(result).toContain("Accessibility");
    });

    it("returns null for cliclick non-permission errors", () => {
      const err = { message: "some other error", stderr: "", stdout: "" };
      const result = detectPermissionError(err, "cliclick");
      expect(result).toBeNull();
    });

    it("includes terminal app name in permission messages", () => {
      process.env.TERM_PROGRAM = "iTerm.app";
      const err = new Error("Command failed");
      const result = detectPermissionError(err, "screencapture");
      expect(result).toContain("iTerm2");
    });
  });

  describe("screenshot permission error in dispatch", () => {
    let mockDriver: ReturnType<typeof createMockDriver>;

    beforeEach(() => {
      mockDriver = createMockDriver();
      setDriver(mockDriver);
      __resetMockConfig();
      resetVlmClient();
    });

    it("returns friendly message when screenshot fails with permission error", async () => {
      mockDriver.screenshot.mockRejectedValue(
        new Error("Screen Recording permission required for screenshots.\nFix: System Settings → Privacy & Security → Screen Recording → enable your terminal app\nThen restart the terminal.")
      );

      const result = await dispatch({ action: "screenshot" });
      expect(result).toContain("Screen Recording permission");
      expect(result).toContain("System Settings");
    });

    it("returns friendly message when screenshot returns empty file error", async () => {
      mockDriver.screenshot.mockRejectedValue(
        new Error("Screenshot file is empty — likely a Screen Recording permission issue.\nFix: System Settings → Privacy & Security → Screen Recording → enable your terminal app\nThen restart the terminal.")
      );

      const result = await dispatch({ action: "screenshot" });
      expect(result).toContain("Screenshot file is empty");
      expect(result).toContain("System Settings");
    });
  });
});
