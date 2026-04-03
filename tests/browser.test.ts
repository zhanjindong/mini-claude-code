import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the session module to avoid actual Playwright dependency
const mockPage = {
  goto: vi.fn().mockResolvedValue(undefined),
  title: vi.fn().mockResolvedValue("Test Page"),
  url: vi.fn().mockReturnValue("https://example.com"),
  click: vi.fn().mockResolvedValue(undefined),
  fill: vi.fn().mockResolvedValue(undefined),
  selectOption: vi.fn().mockResolvedValue(undefined),
  evaluate: vi.fn().mockResolvedValue("evaluated"),
  innerText: vi.fn().mockResolvedValue("Page text content"),
  waitForSelector: vi.fn().mockResolvedValue(undefined),
  waitForLoadState: vi.fn().mockResolvedValue(undefined),
  goBack: vi.fn().mockResolvedValue(undefined),
  goForward: vi.fn().mockResolvedValue(undefined),
  accessibility: {
    snapshot: vi.fn().mockResolvedValue({
      role: "WebArea",
      name: "Test Page",
      children: [
        { role: "heading", name: "Hello", level: 1 },
        { role: "link", name: "About" },
      ],
    }),
  },
};

let sessionActive = false;

vi.mock("@/tools/browser/session.js", () => ({
  browserSession: {
    ensureBrowser: vi.fn(async () => {
      sessionActive = true;
      return mockPage;
    }),
    getPage: vi.fn(async () => {
      sessionActive = true;
      return mockPage;
    }),
    isActive: vi.fn(() => sessionActive),
    close: vi.fn(async () => {
      sessionActive = false;
    }),
  },
  closeBrowser: vi.fn(),
}));

const { BrowserTool } = await import("@/tools/browser.js");
const { browserSession } = await import("@/tools/browser/session.js");

describe("BrowserTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionActive = false;
  });

  describe("tool definition", () => {
    it("has correct name and permission level", () => {
      expect(BrowserTool.name).toBe("Browser");
      expect(BrowserTool.permissionLevel).toBe("execute");
    });

    it("has action as required parameter", () => {
      expect(BrowserTool.inputSchema.required).toEqual(["action"]);
    });

    it("defines all expected actions in enum", () => {
      const actionProp = BrowserTool.inputSchema.properties.action as any;
      expect(actionProp.enum).toContain("launch");
      expect(actionProp.enum).toContain("navigate");
      expect(actionProp.enum).toContain("click");
      expect(actionProp.enum).toContain("type");
      expect(actionProp.enum).toContain("select_option");
      expect(actionProp.enum).toContain("scroll");
      expect(actionProp.enum).toContain("execute_js");
      expect(actionProp.enum).toContain("get_content");
      expect(actionProp.enum).toContain("wait");
      expect(actionProp.enum).toContain("back");
      expect(actionProp.enum).toContain("forward");
      expect(actionProp.enum).toContain("close");
    });
  });

  describe("action validation", () => {
    it("returns error for missing action", async () => {
      const result = await BrowserTool.execute({});
      expect(result).toContain("Error");
      expect(result).toContain("action");
    });

    it("returns error for unknown action", async () => {
      const result = await BrowserTool.execute({ action: "fly" });
      expect(result).toContain("Error");
      expect(result).toContain("Unknown action");
      expect(result).toContain("fly");
    });
  });

  describe("launch", () => {
    it("launches browser without URL", async () => {
      const result = await BrowserTool.execute({ action: "launch" });
      expect(result).toContain("Browser launched");
      expect(browserSession.ensureBrowser).toHaveBeenCalled();
    });

    it("launches browser and navigates to URL", async () => {
      const result = await BrowserTool.execute({
        action: "launch",
        url: "https://example.com",
      });
      expect(result).toContain("https://example.com");
      expect(mockPage.goto).toHaveBeenCalledWith(
        "https://example.com",
        expect.any(Object)
      );
    });
  });

  describe("navigate", () => {
    it("navigates to URL", async () => {
      const result = await BrowserTool.execute({
        action: "navigate",
        url: "https://example.com/page",
      });
      expect(result).toContain("Navigated to");
      expect(mockPage.goto).toHaveBeenCalledWith(
        "https://example.com/page",
        expect.any(Object)
      );
    });
  });

  describe("click", () => {
    it("clicks an element by selector", async () => {
      const result = await BrowserTool.execute({
        action: "click",
        selector: "[data-mcc-id='3']",
      });
      expect(result).toContain("Clicked");
      expect(mockPage.click).toHaveBeenCalledWith(
        "[data-mcc-id='3']",
        expect.any(Object)
      );
    });
  });

  describe("type", () => {
    it("fills text into an input", async () => {
      const result = await BrowserTool.execute({
        action: "type",
        selector: "input[name='email']",
        text: "test@example.com",
      });
      expect(result).toContain("Typed");
      expect(result).toContain("test@example.com");
      expect(mockPage.fill).toHaveBeenCalledWith(
        "input[name='email']",
        "test@example.com",
        expect.any(Object)
      );
    });
  });

  describe("select_option", () => {
    it("selects a dropdown option", async () => {
      const result = await BrowserTool.execute({
        action: "select_option",
        selector: "#country",
        value: "China",
      });
      expect(result).toContain("Selected option");
      expect(result).toContain("China");
      expect(mockPage.selectOption).toHaveBeenCalled();
    });
  });

  describe("scroll", () => {
    it("scrolls down by default", async () => {
      const result = await BrowserTool.execute({ action: "scroll" });
      expect(result).toContain("Scrolled down");
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it("scrolls up when specified", async () => {
      const result = await BrowserTool.execute({
        action: "scroll",
        direction: "up",
      });
      expect(result).toContain("Scrolled up");
    });
  });

  describe("execute_js", () => {
    it("executes JavaScript and returns result", async () => {
      mockPage.evaluate.mockResolvedValueOnce({ count: 42 });
      const result = await BrowserTool.execute({
        action: "execute_js",
        script: "({count: 42})",
      });
      expect(result).toContain("42");
    });

    it("handles undefined result", async () => {
      mockPage.evaluate.mockResolvedValueOnce(undefined);
      const result = await BrowserTool.execute({
        action: "execute_js",
        script: "void 0",
      });
      expect(result).toBe("(undefined)");
    });

    it("handles string result", async () => {
      mockPage.evaluate.mockResolvedValueOnce("hello world");
      const result = await BrowserTool.execute({
        action: "execute_js",
        script: "'hello world'",
      });
      expect(result).toBe("hello world");
    });
  });

  describe("get_content", () => {
    it("extracts text content by default", async () => {
      const result = await BrowserTool.execute({ action: "get_content" });
      expect(result).toContain("URL:");
      expect(result).toContain("Title:");
      expect(result).toContain("Page text content");
    });

    it("extracts DOM content", async () => {
      mockPage.evaluate.mockResolvedValueOnce(
        '<div>\n  [1] <a href="/about">About</a>\n</div>'
      );
      const result = await BrowserTool.execute({
        action: "get_content",
        format: "dom",
      });
      expect(result).toContain("URL:");
      expect(result).toContain("[1]");
    });

    it("extracts accessibility tree", async () => {
      const result = await BrowserTool.execute({
        action: "get_content",
        format: "accessibility",
      });
      expect(result).toContain("WebArea");
      expect(result).toContain("heading");
      expect(result).toContain("Hello");
    });
  });

  describe("wait", () => {
    it("waits for element to appear", async () => {
      const result = await BrowserTool.execute({
        action: "wait",
        selector: "#loading-done",
      });
      expect(result).toContain("Element found");
      expect(mockPage.waitForSelector).toHaveBeenCalledWith("#loading-done", {
        timeout: 10000,
      });
    });

    it("uses custom timeout", async () => {
      await BrowserTool.execute({
        action: "wait",
        selector: ".spinner",
        timeout: 5000,
      });
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(".spinner", {
        timeout: 5000,
      });
    });
  });

  describe("navigation history", () => {
    it("goes back", async () => {
      const result = await BrowserTool.execute({ action: "back" });
      expect(result).toContain("Navigated back");
      expect(mockPage.goBack).toHaveBeenCalled();
    });

    it("goes forward", async () => {
      const result = await BrowserTool.execute({ action: "forward" });
      expect(result).toContain("Navigated forward");
      expect(mockPage.goForward).toHaveBeenCalled();
    });
  });

  describe("close", () => {
    it("closes browser", async () => {
      const result = await BrowserTool.execute({ action: "close" });
      expect(result).toBe("Browser closed");
      expect(browserSession.close).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("returns error message on action failure", async () => {
      mockPage.click.mockRejectedValueOnce(new Error("Element not found"));
      const result = await BrowserTool.execute({
        action: "click",
        selector: "#nonexistent",
      });
      expect(result).toContain("Error [click]");
      expect(result).toContain("Element not found");
    });

    it("returns playwright install message on import failure", async () => {
      vi.mocked(browserSession.getPage).mockRejectedValueOnce(
        new Error("Playwright is not installed. Run:\n  npm install playwright-core\nIf you don't have Chrome installed, also run:\n  npx playwright-core install chromium")
      );
      const result = await BrowserTool.execute({
        action: "navigate",
        url: "https://example.com",
      });
      expect(result).toContain("Playwright is not installed");
      expect(result).toContain("npm install playwright-core");
    });
  });
});

describe("BrowserSession (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionActive = false;
  });

  it("starts inactive", () => {
    expect(browserSession.isActive()).toBe(false);
  });

  it("becomes active after ensureBrowser", async () => {
    await browserSession.ensureBrowser();
    expect(browserSession.isActive()).toBe(true);
  });

  it("becomes inactive after close", async () => {
    await browserSession.ensureBrowser();
    expect(browserSession.isActive()).toBe(true);
    await browserSession.close();
    expect(browserSession.isActive()).toBe(false);
  });
});
