// macOS Accessibility tree extraction via AppleScript System Events
// Provides structured UI element data as a fast, free alternative to screenshot + VLM

import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface AXElement {
  role: string;
  title: string;
  value: string;
  description: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  enabled: boolean;
  focused: boolean;
  children?: AXElement[];
}

export interface AXWindow {
  title: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  elements: AXElement[];
}

export interface AccessibilitySnapshot {
  frontmostApp: string;
  windows: AXWindow[];
  elementCount: number;
  timestamp: number;
}

export interface AppInfo {
  name: string;
  displayName: string;
  windowCount: number;
  windows: string[];
}

const AX_TIMEOUT = 5000;
const MAX_ELEMENTS = 200;

/**
 * Helper to serialize one element level in AppleScript.
 * Returns the AppleScript code block for extracting element properties at a given indent.
 */
function elementBlock(varPrefix: string, indent: string): string {
  return `
                set ${varPrefix}Role to ""
                try
                  set ${varPrefix}Role to role of ${varPrefix}
                end try
                if ${varPrefix}Role is not "" then
                  set ${varPrefix}Title to ""
                  try
                    set ${varPrefix}Title to title of ${varPrefix}
                    if ${varPrefix}Title is missing value then set ${varPrefix}Title to ""
                  end try
                  set ${varPrefix}Desc to ""
                  try
                    set ${varPrefix}Desc to description of ${varPrefix}
                    if ${varPrefix}Desc is missing value then set ${varPrefix}Desc to ""
                  end try
                  set ${varPrefix}Value to ""
                  try
                    set rawV to value of ${varPrefix}
                    if rawV is not missing value then
                      try
                        set ${varPrefix}Value to rawV as text
                      end try
                    end if
                    if (length of ${varPrefix}Value) > 80 then
                      set ${varPrefix}Value to (text 1 thru 80 of ${varPrefix}Value) & "..."
                    end if
                  end try
                  set ${varPrefix}PosStr to ""
                  try
                    set ${varPrefix}Pos to position of ${varPrefix}
                    set ${varPrefix}Sz to size of ${varPrefix}
                    set ${varPrefix}PosStr to " at(" & (item 1 of ${varPrefix}Pos as text) & "," & (item 2 of ${varPrefix}Pos as text) & ") " & (item 1 of ${varPrefix}Sz as text) & "x" & (item 2 of ${varPrefix}Sz as text)
                  end try
                  set ${varPrefix}Flags to ""
                  try
                    if not (enabled of ${varPrefix}) then set ${varPrefix}Flags to ${varPrefix}Flags & " disabled"
                  end try
                  try
                    if focused of ${varPrefix} then set ${varPrefix}Flags to ${varPrefix}Flags & " focused"
                  end try
                  set ${varPrefix}Label to ""
                  if ${varPrefix}Title is not "" then
                    set ${varPrefix}Label to " " & quote & ${varPrefix}Title & quote
                  else if ${varPrefix}Desc is not "" then
                    set ${varPrefix}Label to " " & quote & ${varPrefix}Desc & quote
                  end if
                  set ${varPrefix}ValStr to ""
                  if ${varPrefix}Value is not "" and ${varPrefix}Value is not ${varPrefix}Title then
                    set ${varPrefix}ValStr to " value=" & quote & ${varPrefix}Value & quote
                  end if
                  set output to output & "${indent}[" & ${varPrefix}Role & ${varPrefix}Label & ${varPrefix}PosStr & ${varPrefix}ValStr & ${varPrefix}Flags & "]" & linefeed`;
}

/**
 * Build an AppleScript that iteratively walks 3 levels of the UI element tree.
 * Uses System Events which works via osascript without needing explicit Accessibility permission.
 * Avoids recursive handlers (which fail with osascript -e) by unrolling 3 depth levels.
 */
function buildTreeScript(appName?: string): string {
  // Target a specific app by name, or the frontmost app
  const procSelector = appName
    ? `first process whose name is "${appName.replace(/"/g, '\\"')}"`
    : "first process whose frontmost is true";
  return `tell application "System Events"
  set frontProc to ${procSelector}
  set procName to name of frontProc
  set output to "APP:" & procName & linefeed
  set totalCount to 0
  set maxElems to ${MAX_ELEMENTS}

  set winList to windows of frontProc
  repeat with win in winList
    set winTitle to ""
    try
      set winTitle to name of win
      if winTitle is missing value then set winTitle to ""
    end try
    set winPosStr to ""
    set winSzStr to ""
    try
      set wp to position of win
      set ws to size of win
      set winPosStr to (item 1 of wp as text) & "," & (item 2 of wp as text)
      set winSzStr to (item 1 of ws as text) & "x" & (item 2 of ws as text)
    end try
    set output to output & "WIN:" & winTitle & "|" & winPosStr & "|" & winSzStr & linefeed

    try
      set topElems to every UI element of win
      repeat with el in topElems
        if totalCount >= maxElems then exit repeat
        set totalCount to totalCount + 1
        -- Depth 1
        set elRole to ""
        try
          set elRole to role of el
        end try
        if elRole is not "" then
          set elTitle to ""
          try
            set elTitle to title of el
            if elTitle is missing value then set elTitle to ""
          end try
          set elDesc to ""
          try
            set elDesc to description of el
            if elDesc is missing value then set elDesc to ""
          end try
          set elValue to ""
          try
            set rawV to value of el
            if rawV is not missing value then
              try
                set elValue to rawV as text
              end try
            end if
            if (length of elValue) > 80 then
              set elValue to (text 1 thru 80 of elValue) & "..."
            end if
          end try
          set posStr to ""
          try
            set elPos to position of el
            set elSz to size of el
            set posStr to " at(" & (item 1 of elPos as text) & "," & (item 2 of elPos as text) & ") " & (item 1 of elSz as text) & "x" & (item 2 of elSz as text)
          end try
          set flags to ""
          try
            if not (enabled of el) then set flags to flags & " disabled"
          end try
          try
            if focused of el then set flags to flags & " focused"
          end try
          set label to ""
          if elTitle is not "" then
            set label to " " & quote & elTitle & quote
          else if elDesc is not "" then
            set label to " " & quote & elDesc & quote
          end if
          set valStr to ""
          if elValue is not "" and elValue is not elTitle then
            set valStr to " value=" & quote & elValue & quote
          end if
          set output to output & "  [" & elRole & label & posStr & valStr & flags & "]" & linefeed

          -- Depth 2: children
          try
            set children to every UI element of el
            repeat with ch in children
              if totalCount >= maxElems then exit repeat
              set totalCount to totalCount + 1
              set chRole to ""
              try
                set chRole to role of ch
              end try
              if chRole is not "" then
                set chTitle to ""
                try
                  set chTitle to title of ch
                  if chTitle is missing value then set chTitle to ""
                end try
                set chDesc to ""
                try
                  set chDesc to description of ch
                  if chDesc is missing value then set chDesc to ""
                end try
                set chValue to ""
                try
                  set rawV to value of ch
                  if rawV is not missing value then
                    try
                      set chValue to rawV as text
                    end try
                  end if
                  if (length of chValue) > 80 then
                    set chValue to (text 1 thru 80 of chValue) & "..."
                  end if
                end try
                set cPosStr to ""
                try
                  set cPos to position of ch
                  set cSz to size of ch
                  set cPosStr to " at(" & (item 1 of cPos as text) & "," & (item 2 of cPos as text) & ") " & (item 1 of cSz as text) & "x" & (item 2 of cSz as text)
                end try
                set cFlags to ""
                try
                  if not (enabled of ch) then set cFlags to cFlags & " disabled"
                end try
                try
                  if focused of ch then set cFlags to cFlags & " focused"
                end try
                set cLabel to ""
                if chTitle is not "" then
                  set cLabel to " " & quote & chTitle & quote
                else if chDesc is not "" then
                  set cLabel to " " & quote & chDesc & quote
                end if
                set cValStr to ""
                if chValue is not "" and chValue is not chTitle then
                  set cValStr to " value=" & quote & chValue & quote
                end if
                set output to output & "    [" & chRole & cLabel & cPosStr & cValStr & cFlags & "]" & linefeed

                -- Depth 3: grandchildren
                try
                  set gchildren to every UI element of ch
                  repeat with gc in gchildren
                    if totalCount >= maxElems then exit repeat
                    set totalCount to totalCount + 1
                    set gcRole to ""
                    try
                      set gcRole to role of gc
                    end try
                    if gcRole is not "" then
                      set gcTitle to ""
                      try
                        set gcTitle to title of gc
                        if gcTitle is missing value then set gcTitle to ""
                      end try
                      set gcDesc to ""
                      try
                        set gcDesc to description of gc
                        if gcDesc is missing value then set gcDesc to ""
                      end try
                      set gcPosStr to ""
                      try
                        set gcP to position of gc
                        set gcS to size of gc
                        set gcPosStr to " at(" & (item 1 of gcP as text) & "," & (item 2 of gcP as text) & ") " & (item 1 of gcS as text) & "x" & (item 2 of gcS as text)
                      end try
                      set gcLabel to ""
                      if gcTitle is not "" then
                        set gcLabel to " " & quote & gcTitle & quote
                      else if gcDesc is not "" then
                        set gcLabel to " " & quote & gcDesc & quote
                      end if
                      set output to output & "      [" & gcRole & gcLabel & gcPosStr & "]" & linefeed
                    end if
                  end repeat
                end try
              end if
            end repeat
          end try
        end if
      end repeat
    end try
  end repeat
  set output to output & "COUNT:" & (totalCount as text)
  return output
end tell
`;
}

/**
 * Parse the AppleScript output into an AccessibilitySnapshot.
 */
export function parseTreeOutput(raw: string): AccessibilitySnapshot {
  const lines = raw.split("\n");
  let frontmostApp = "";
  const windows: AXWindow[] = [];
  let elementCount = 0;

  for (const line of lines) {
    if (line.startsWith("APP:")) {
      frontmostApp = line.slice(4).trim();
    } else if (line.startsWith("WIN:")) {
      const parts = line.slice(4).split("|");
      const title = parts[0] || "";
      const posParts = (parts[1] || "").split(",");
      const sizeParts = (parts[2] || "").split("x");
      windows.push({
        title,
        position: {
          x: parseInt(posParts[0], 10) || 0,
          y: parseInt(posParts[1], 10) || 0,
        },
        size: {
          width: parseInt(sizeParts[0], 10) || 0,
          height: parseInt(sizeParts[1], 10) || 0,
        },
        elements: [],
      });
    } else if (line.startsWith("COUNT:")) {
      elementCount = parseInt(line.slice(6).trim(), 10) || 0;
    }
  }

  return {
    frontmostApp,
    windows,
    elementCount,
    timestamp: Date.now(),
  };
}

/**
 * Query the accessibility tree of the frontmost application on macOS.
 * Writes the AppleScript to a temp file and executes it (avoids osascript -e parsing issues).
 * Returns null if the query fails or is unsupported.
 */
export async function getAccessibilityTree(appName?: string): Promise<{ snapshot: AccessibilitySnapshot; rawTree: string } | null> {
  const scriptPath = join(tmpdir(), "mcc-ax-tree.scpt");
  try {
    // Resolve display name to process name if provided
    const resolvedName = appName ? (await resolveAppName(appName) || appName) : undefined;
    const script = buildTreeScript(resolvedName);
    writeFileSync(scriptPath, script, "utf-8");

    const raw = execFileSync("osascript", [scriptPath], {
      encoding: "utf-8",
      timeout: AX_TIMEOUT,
      maxBuffer: 1024 * 1024,
    }).trim();

    if (!raw) return null;

    const snapshot = parseTreeOutput(raw);

    // Build formatted output: convert APP:/WIN: headers to readable format
    const outputLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("APP:")) {
        outputLines.push(`[App: ${line.slice(4).trim()}]`);
      } else if (line.startsWith("WIN:")) {
        const parts = line.slice(4).split("|");
        const title = parts[0] || "Untitled";
        const pos = parts[1] || "?";
        const size = parts[2] || "?";
        outputLines.push(`[Window: "${title}" at (${pos}) ${size}]`);
      } else if (line.startsWith("COUNT:")) {
        // skip
      } else if (line.trim()) {
        outputLines.push(line);
      }
    }

    return {
      snapshot,
      rawTree: outputLines.join("\n"),
    };
  } catch {
    return null;
  } finally {
    try { unlinkSync(scriptPath); } catch { /* ignore */ }
  }
}

/**
 * Query the UI element at a specific screen coordinate.
 */
export async function getElementAtPoint(
  x: number,
  y: number
): Promise<AXElement | null> {
  const scriptPath = join(tmpdir(), "mcc-ax-point.scpt");
  try {
    const script = `tell application "System Events"
  set frontProc to first process whose frontmost is true
  set allElems to every UI element of window 1 of frontProc
  set bestMatch to ""
  set bestArea to 9999999

  repeat with el in allElems
    try
      set elPos to position of el
      set elSz to size of el
      set ex to item 1 of elPos
      set ey to item 2 of elPos
      set ew to item 1 of elSz
      set eh to item 2 of elSz

      if ${x} >= ex and ${x} <= (ex + ew) and ${y} >= ey and ${y} <= (ey + eh) then
        set area to ew * eh
        if area < bestArea then
          set bestArea to area
          set elRole to role of el
          set elTitle to ""
          try
            set elTitle to title of el
            if elTitle is missing value then set elTitle to ""
          end try
          set elDesc to ""
          try
            set elDesc to description of el
            if elDesc is missing value then set elDesc to ""
          end try
          set bestMatch to elRole & "|" & elTitle & "|" & elDesc & "|" & ex & "," & ey & "|" & ew & "x" & eh
        end if
      end if
    end try
  end repeat

  return bestMatch
end tell
`;
    writeFileSync(scriptPath, script, "utf-8");

    const raw = execFileSync("osascript", [scriptPath], {
      encoding: "utf-8",
      timeout: AX_TIMEOUT,
    }).trim();

    if (!raw) return null;

    const parts = raw.split("|");
    if (parts.length < 5) return null;

    const posParts = (parts[3] || "").split(",");
    const sizeParts = (parts[4] || "").split("x");

    return {
      role: parts[0] || "",
      title: parts[1] || "",
      value: "",
      description: parts[2] || "",
      position: {
        x: parseInt(posParts[0], 10) || 0,
        y: parseInt(posParts[1], 10) || 0,
      },
      size: {
        width: parseInt(sizeParts[0], 10) || 0,
        height: parseInt(sizeParts[1], 10) || 0,
      },
      enabled: true,
      focused: false,
    };
  } catch {
    return null;
  } finally {
    try { unlinkSync(scriptPath); } catch { /* ignore */ }
  }
}

/**
 * List all visible applications and their window titles.
 */
export async function listVisibleApps(): Promise<AppInfo[] | null> {
  const scriptPath = join(tmpdir(), "mcc-ax-apps.scpt");
  try {
    const script = `tell application "System Events"
  set output to ""
  set visibleProcs to every process whose visible is true
  repeat with proc in visibleProcs
    set procName to name of proc
    set dispName to procName
    try
      set dispName to displayed name of proc
      if dispName is missing value then set dispName to procName
    end try
    set winCount to count of windows of proc
    set winTitles to ""
    if winCount > 0 then
      repeat with w in windows of proc
        try
          set wName to name of w
          if wName is missing value then set wName to "(untitled)"
          set winTitles to winTitles & "||" & wName
        end try
      end repeat
    end if
    set output to output & procName & "||" & dispName & "|" & (winCount as text) & winTitles & linefeed
  end repeat
  return output
end tell
`;
    writeFileSync(scriptPath, script, "utf-8");
    const raw = execFileSync("osascript", [scriptPath], {
      encoding: "utf-8",
      timeout: AX_TIMEOUT,
    }).trim();

    if (!raw) return null;

    const apps: AppInfo[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      // Format: name||displayName|windowCount||win1||win2...
      // Split by || first to get segments
      const segments = line.split("||");
      const name = segments[0] || "";
      // Second segment contains "displayName|count"
      const meta = (segments[1] || "").split("|");
      const displayName = meta[0] || name;
      const windowCount = parseInt(meta[1], 10) || 0;
      // Remaining segments are window titles
      const windows: string[] = [];
      for (let i = 2; i < segments.length; i++) {
        if (segments[i]) windows.push(segments[i]);
      }
      apps.push({ name, displayName, windowCount, windows });
    }

    return apps;
  } catch {
    return null;
  } finally {
    try { unlinkSync(scriptPath); } catch { /* ignore */ }
  }
}

/**
 * Resolve an app name (which may be a display name like "微信") to the actual process name ("WeChat").
 * Tries process name first, then falls back to display name matching.
 */
export async function resolveAppName(appName: string): Promise<string | null> {
  const apps = await listVisibleApps();
  if (!apps) return null;

  // Exact match on process name
  const exact = apps.find((a) => a.name === appName);
  if (exact) return exact.name;

  // Exact match on display name
  const byDisplay = apps.find((a) => a.displayName === appName);
  if (byDisplay) return byDisplay.name;

  // Case-insensitive match
  const lower = appName.toLowerCase();
  const byLower = apps.find(
    (a) => a.name.toLowerCase() === lower || a.displayName.toLowerCase() === lower
  );
  if (byLower) return byLower.name;

  return null;
}

/**
 * Activate (bring to front) a specific application by name.
 * Supports both process names ("WeChat") and display names ("微信").
 * Returns true on success, false on failure.
 */
export async function activateApp(appName: string): Promise<boolean> {
  const scriptPath = join(tmpdir(), "mcc-ax-activate.scpt");
  try {
    // Resolve display name to process name if needed
    const resolvedName = await resolveAppName(appName) || appName;
    const safeName = resolvedName.replace(/"/g, '\\"');
    const script = `tell application "System Events"
  set targetProc to first process whose name is "${safeName}"
  set frontmost of targetProc to true
end tell
return "OK"
`;
    writeFileSync(scriptPath, script, "utf-8");
    const raw = execFileSync("osascript", [scriptPath], {
      encoding: "utf-8",
      timeout: AX_TIMEOUT,
    }).trim();
    return raw === "OK";
  } catch {
    return false;
  } finally {
    try { unlinkSync(scriptPath); } catch { /* ignore */ }
  }
}

/**
 * Format the accessibility tree for LLM consumption.
 */
export function formatTreeForLLM(rawTree: string): string {
  return rawTree;
}

/**
 * Check if the accessibility tree is "rich enough" to skip VLM.
 * Returns true if the tree has meaningful content.
 */
export function isTreeSufficient(
  snapshot: AccessibilitySnapshot,
  rawTree: string
): boolean {
  if (snapshot.elementCount < 3) return false;
  // Need elements with text content (quoted strings indicate labeled elements)
  const quotedStrings = rawTree.match(/"/g);
  if (!quotedStrings || quotedStrings.length < 4) return false;
  return true;
}

/**
 * Search the raw tree text for elements matching a query string.
 * Returns matching lines with context.
 */
export function searchTree(rawTree: string, query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const lines = rawTree.split("\n");
  const matches: string[] = [];

  for (const line of lines) {
    if (line.toLowerCase().includes(lowerQuery)) {
      matches.push(line.trim());
    }
  }

  return matches;
}
