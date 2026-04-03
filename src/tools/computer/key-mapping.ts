// Key name → cliclick command sequence mapping

const MODIFIER_MAP: Record<string, string> = {
  cmd: "cmd",
  command: "cmd",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
};

const KEY_MAP: Record<string, string> = {
  enter: "return",
  return: "return",
  tab: "tab",
  space: "space",
  escape: "escape",
  esc: "escape",
  backspace: "delete",
  delete: "fwd-delete",
  up: "arrow-up",
  down: "arrow-down",
  left: "arrow-left",
  right: "arrow-right",
  home: "home",
  end: "end",
  pageup: "page-up",
  pagedown: "page-down",
  f1: "f1",
  f2: "f2",
  f3: "f3",
  f4: "f4",
  f5: "f5",
  f6: "f6",
  f7: "f7",
  f8: "f8",
  f9: "f9",
  f10: "f10",
  f11: "f11",
  f12: "f12",
};

/**
 * Parse a human-friendly key string into cliclick command sequence.
 * Examples:
 *   "cmd+c"           → ["kd:cmd", "kp:c", "ku:cmd"]
 *   "ctrl+shift+tab"  → ["kd:ctrl", "kd:shift", "kp:tab", "ku:shift", "ku:ctrl"]
 *   "enter"           → ["kp:return"]
 *   "a"               → ["kp:a"]
 */
export function parseKeyCombo(keyStr: string): string[] {
  const parts = keyStr.toLowerCase().split("+").map((s) => s.trim());
  const modifiers: string[] = [];
  let mainKey: string | null = null;

  for (const part of parts) {
    if (MODIFIER_MAP[part]) {
      modifiers.push(MODIFIER_MAP[part]);
    } else {
      mainKey = KEY_MAP[part] || part;
    }
  }

  if (!mainKey && modifiers.length > 0) {
    // Edge case: just modifier keys pressed (unlikely but handle it)
    mainKey = modifiers.pop()!;
  }

  const commands: string[] = [];

  // Press modifiers down
  for (const mod of modifiers) {
    commands.push(`kd:${mod}`);
  }

  // Press main key
  if (mainKey) {
    commands.push(`kp:${mainKey}`);
  }

  // Release modifiers in reverse order
  for (let i = modifiers.length - 1; i >= 0; i--) {
    commands.push(`ku:${modifiers[i]}`);
  }

  return commands;
}
