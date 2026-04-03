// BrowserSession — singleton Playwright lifecycle manager
// Uses 'any' types since playwright is an optional dependency

/* eslint-disable @typescript-eslint/no-explicit-any */

let playwrightModule: any = null;

async function importPlaywright(): Promise<any> {
  if (playwrightModule) return playwrightModule;
  try {
    // Dynamic import — playwright-core is an optional dependency
    playwrightModule = await (Function('return import("playwright-core")')() as Promise<any>);
    return playwrightModule;
  } catch {
    throw new Error(
      "Playwright is not installed. Run:\n  npm install playwright-core\nIf you don't have Chrome installed, also run:\n  npx playwright-core install chromium"
    );
  }
}

class BrowserSession {
  private browser: any = null;
  private context: any = null;
  private page: any = null;

  async ensureBrowser(onProgress?: (msg: string) => void): Promise<any> {
    if (this.page && this.browser?.isConnected()) {
      return this.page;
    }
    // Clean up stale state
    await this.close();

    onProgress?.("Launching browser...");

    const pw = await importPlaywright();
    const headless = process.env.MCC_BROWSER_HEADLESS !== "false";

    const launchWithProgress = async (opts: any, label: string) => {
      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed += 3;
        onProgress?.(`Still launching ${label}... (${elapsed}s)`);
      }, 3000);
      try {
        return await pw.chromium.launch(opts);
      } finally {
        clearInterval(timer);
      }
    };

    // Prefer system Chrome, fallback to Playwright's bundled Chromium
    try {
      this.browser = await launchWithProgress({ channel: "chrome", headless }, "Chrome");
    } catch {
      try {
        onProgress?.("System Chrome not found, trying Playwright Chromium...");
        this.browser = await launchWithProgress({ headless }, "Chromium");
      } catch {
        throw new Error(
          "No browser available. Either:\n" +
          "  1. Install Chrome/Chromium on your system, or\n" +
          "  2. Run: npx playwright-core install chromium"
        );
      }
    }
    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    this.page = await this.context.newPage();
    return this.page;
  }

  async getPage(onProgress?: (msg: string) => void): Promise<any> {
    return this.ensureBrowser(onProgress);
  }

  isActive(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }

  async close(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
    } catch {
      // Ignore cleanup errors
    }
    this.page = null;
  }
}

// Singleton instance
export const browserSession = new BrowserSession();

// Synchronous cleanup for process exit
export function closeBrowser(): void {
  if (browserSession.isActive()) {
    // browser.close() is async but process.on("exit") must be sync
    // Playwright handles this gracefully — the subprocess gets killed
    browserSession.close().catch(() => {});
  }
}
