import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// --- T-01: Type definitions and defaults ---

/**
 * Configuration file structure (~/.claude/config.json or .claude/config.json).
 */
export interface MccConfig {
  provider?: string;
  model?: string;
  maxTokens?: number;
  baseURL?: string;
  /** Permission presets: key is tool name (lowercase), value is action. */
  permissions?: Record<string, "allow" | "deny" | "ask">;
  /** Custom tool paths (reserved for Phase 2). */
  toolPaths?: string[];
}

/**
 * Fully resolved configuration after merging all layers.
 */
export interface ResolvedConfig {
  provider: string;
  model: string;
  maxTokens: number;
  baseURL: string;
  permissions: Record<string, "allow" | "deny" | "ask">;
  toolPaths: string[];
  apiKey: string;
}

const defaults: ResolvedConfig = {
  provider: "minimax",
  model: "",
  maxTokens: 8192,
  baseURL: "",
  permissions: {},
  toolPaths: [],
  apiKey: "",
};

// --- T-02: File reading and merging ---

/**
 * Try to read and parse a JSON config file. Returns an empty object on any failure.
 */
function readJsonConfig(filePath: string): Partial<MccConfig> {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Partial<MccConfig>;
  } catch {
    return {};
  }
}

/**
 * Extract config-relevant values from environment variables.
 */
function readEnvConfig(): Partial<MccConfig & { apiKey?: string }> {
  const env: Partial<MccConfig & { apiKey?: string }> = {};

  const apiKey = process.env.MCC_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey) {
    env.apiKey = apiKey;
  }
  if (process.env.MCC_PROVIDER) {
    env.provider = process.env.MCC_PROVIDER;
  }
  if (process.env.MCC_MODEL) {
    env.model = process.env.MCC_MODEL;
  }
  if (process.env.MCC_BASE_URL) {
    env.baseURL = process.env.MCC_BASE_URL;
  }

  return env;
}

/**
 * Merge a partial config layer into a base ResolvedConfig.
 * permissions are merged with Object.assign (layer overwrites base keys).
 */
function mergeConfig(
  base: ResolvedConfig,
  layer: Partial<MccConfig & { apiKey?: string }>
): ResolvedConfig {
  const merged: ResolvedConfig = { ...base };

  if (layer.provider !== undefined) merged.provider = layer.provider;
  if (layer.model !== undefined) merged.model = layer.model;
  if (layer.maxTokens !== undefined) merged.maxTokens = layer.maxTokens;
  if (layer.baseURL !== undefined) merged.baseURL = layer.baseURL;
  if (layer.apiKey !== undefined) merged.apiKey = layer.apiKey;
  if (layer.toolPaths !== undefined) merged.toolPaths = layer.toolPaths;
  if (layer.permissions !== undefined) {
    merged.permissions = Object.assign({}, base.permissions, layer.permissions);
  }

  return merged;
}

/**
 * Load and merge configuration from all layers (synchronous).
 *
 * Merge order: defaults <- ~/.claude/config.json <- .claude/config.json <- env vars <- CLI overrides
 */
export function loadConfig(
  overrides?: Partial<MccConfig & { apiKey?: string }>
): ResolvedConfig {
  const userConfigPath = path.join(os.homedir(), ".claude", "config.json");
  const projectConfigPath = path.resolve(".claude", "config.json");

  const userConfig = readJsonConfig(userConfigPath);
  const projectConfig = readJsonConfig(projectConfigPath);
  const envConfig = readEnvConfig();

  let config = { ...defaults };
  config = mergeConfig(config, userConfig);
  config = mergeConfig(config, projectConfig);
  config = mergeConfig(config, envConfig);
  if (overrides) {
    config = mergeConfig(config, overrides);
  }

  // Cache the resolved config as the singleton
  cachedConfig = config;

  return config;
}

// --- T-03: Singleton and saveUserConfig ---

/** Module-level cached config singleton. */
let cachedConfig: ResolvedConfig | null = null;

/**
 * Return the cached resolved config singleton.
 * Must call loadConfig() before calling this function.
 */
export function getConfig(): ResolvedConfig {
  if (!cachedConfig) {
    throw new Error(
      "Config not initialized. Call loadConfig() before getConfig()."
    );
  }
  return cachedConfig;
}

/**
 * Save a partial config patch to the user config file (~/.claude/config.json).
 * Creates the directory if it does not exist.
 * Merges patch into existing user config (does not overwrite unrelated fields).
 */
export function saveUserConfig(patch: Partial<MccConfig>): void {
  const configDir = path.join(os.homedir(), ".claude");
  const configPath = path.join(configDir, "config.json");

  // Read existing user config
  let existing: Partial<MccConfig> = {};
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    existing = JSON.parse(raw) as Partial<MccConfig>;
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  // Merge patch into existing
  const merged = { ...existing, ...patch };
  if (patch.permissions !== undefined) {
    // permissions field is always replaced entirely, not merged
    merged.permissions = patch.permissions;
  }

  // Ensure directory exists
  fs.mkdirSync(configDir, { recursive: true });

  // Write back
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
}
