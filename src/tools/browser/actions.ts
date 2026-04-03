// Browser action handlers

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ToolInput } from "../../types.js";
import { browserSession } from "./session.js";
import { extractText, extractDom, extractAccessibility } from "./dom-extractor.js";

const DEFAULT_TIMEOUT = 10000;

async function actionLaunch(input: ToolInput, onProgress?: (msg: string) => void): Promise<string> {
  const page = await browserSession.ensureBrowser(onProgress);
  const url = input.url as string | undefined;
  if (url) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return `Browser launched and navigated to ${url}\nTitle: ${await page.title()}`;
  }
  return "Browser launched (blank page)";
}

async function actionNavigate(input: ToolInput, onProgress?: (msg: string) => void): Promise<string> {
  const page = await browserSession.getPage(onProgress);
  const url = input.url as string;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  return `Navigated to ${url}\nTitle: ${await page.title()}`;
}

async function actionClick(input: ToolInput): Promise<string> {
  const page = await browserSession.getPage();
  const selector = input.selector as string;
  await page.click(selector, { timeout: DEFAULT_TIMEOUT });
  // Wait a bit for navigation or UI updates
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  return `Clicked: ${selector}\nCurrent URL: ${page.url()}\nTitle: ${await page.title()}`;
}

async function actionType(input: ToolInput): Promise<string> {
  const page = await browserSession.getPage();
  const selector = input.selector as string;
  const text = input.text as string;
  await page.fill(selector, text, { timeout: DEFAULT_TIMEOUT });
  return `Typed "${text}" into ${selector}`;
}

async function actionSelectOption(input: ToolInput): Promise<string> {
  const page = await browserSession.getPage();
  const selector = input.selector as string;
  const value = input.value as string;
  await page.selectOption(selector, { label: value }, { timeout: DEFAULT_TIMEOUT });
  return `Selected option "${value}" in ${selector}`;
}

async function actionScroll(input: ToolInput): Promise<string> {
  const page = await browserSession.getPage();
  const direction = (input.direction as string) || "down";
  const pixels = direction === "up" ? -500 : 500;
  await page.evaluate((px: number) => window.scrollBy(0, px), pixels);
  return `Scrolled ${direction}`;
}

async function actionExecuteJs(input: ToolInput): Promise<string> {
  const page = await browserSession.getPage();
  const script = input.script as string;
  const result = await page.evaluate(script);
  const output =
    result === undefined
      ? "(undefined)"
      : typeof result === "string"
        ? result
        : JSON.stringify(result, null, 2);
  return output.length > 30000
    ? output.slice(0, 30000) + "\n\n... (truncated)"
    : output;
}

async function actionGetContent(input: ToolInput): Promise<string> {
  const page = await browserSession.getPage();
  const format = (input.format as string) || "text";

  const url = page.url();
  const title = await page.title();
  const header = `URL: ${url}\nTitle: ${title}\n\n`;

  let content: string;
  switch (format) {
    case "dom":
      content = await extractDom(page);
      break;
    case "accessibility":
      content = await extractAccessibility(page);
      break;
    case "text":
    default:
      content = await extractText(page);
      break;
  }
  return header + content;
}

async function actionWait(input: ToolInput): Promise<string> {
  const page = await browserSession.getPage();
  const selector = input.selector as string;
  const timeout = (input.timeout as number) || DEFAULT_TIMEOUT;
  await page.waitForSelector(selector, { timeout });
  return `Element found: ${selector}`;
}

async function actionBack(): Promise<string> {
  const page = await browserSession.getPage();
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 });
  return `Navigated back\nCurrent URL: ${page.url()}\nTitle: ${await page.title()}`;
}

async function actionForward(): Promise<string> {
  const page = await browserSession.getPage();
  await page.goForward({ waitUntil: "domcontentloaded", timeout: 10000 });
  return `Navigated forward\nCurrent URL: ${page.url()}\nTitle: ${await page.title()}`;
}

async function actionClose(): Promise<string> {
  await browserSession.close();
  return "Browser closed";
}

const ACTIONS: Record<string, (input: ToolInput, onProgress?: (msg: string) => void) => Promise<string>> = {
  launch: actionLaunch,
  navigate: actionNavigate,
  click: actionClick,
  type: actionType,
  select_option: actionSelectOption,
  scroll: actionScroll,
  execute_js: actionExecuteJs,
  get_content: actionGetContent,
  wait: actionWait,
  back: actionBack,
  forward: actionForward,
  close: actionClose,
};

export async function dispatch(input: ToolInput, onProgress?: (msg: string) => void): Promise<string> {
  const action = input.action as string;
  if (!action) {
    return "Error: 'action' parameter is required";
  }

  const handler = ACTIONS[action];
  if (!handler) {
    return `Error: Unknown action '${action}'. Valid actions: ${Object.keys(ACTIONS).join(", ")}`;
  }

  try {
    return await handler(input, onProgress);
  } catch (err: any) {
    const msg = err.message || String(err);
    // Provide helpful message for Playwright not installed
    if (msg.includes("Playwright is not installed")) {
      return msg;
    }
    return `Error [${action}]: ${msg}`;
  }
}
