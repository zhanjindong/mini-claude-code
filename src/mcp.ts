// MCP (Model Context Protocol) client - stdio transport
// Connects to MCP servers via JSON-RPC 2.0 over stdin/stdout

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ToolDefinition, ToolInput } from "./types.js";

// MCP configuration structures
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

// JSON-RPC 2.0 message types
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// MCP tool description from server
interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Manages a single MCP server connection over stdio.
 * Communicates via JSON-RPC 2.0 messages delimited by newlines.
 */
class McpConnection {
  private process: ChildProcess;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private buffer = "";
  public serverName: string;

  constructor(name: string, config: McpServerConfig) {
    this.serverName = name;
    this.process = spawn(config.command, config.args || [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(config.env || {}) },
      cwd: config.cwd || process.cwd(),
      shell: process.platform === "win32",
    });

    this.process.stdout!.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr!.on("data", (data: Buffer) => {
      process.stderr.write(`[MCP ${name}] ${data.toString()}`);
    });

    this.process.on("exit", (code) => {
      for (const [, pending] of this.pending) {
        pending.reject(
          new Error(`MCP server ${name} exited with code ${code}`)
        );
      }
      this.pending.clear();
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const pending = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error.message));
          } else {
            pending.resolve(msg.result);
          }
        }
      } catch {
        // Invalid JSON line, skip
      }
    }
  }

  async send(
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const data = JSON.stringify(request) + "\n";
      this.process.stdin!.write(data, (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  async initialize(): Promise<void> {
    await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mini-claude-code", version: "0.1.0" },
    });
    // Send initialized notification (no id, no response expected)
    const notification =
      JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }) + "\n";
    this.process.stdin!.write(notification);
  }

  async listTools(): Promise<McpToolInfo[]> {
    const result = (await this.send("tools/list")) as {
      tools: McpToolInfo[];
    };
    return result.tools || [];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    const result = (await this.send("tools/call", {
      name,
      arguments: args,
    })) as {
      content: Array<{ type: string; text?: string }>;
    };
    if (result.content && Array.isArray(result.content)) {
      return result.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join("\n");
    }
    return JSON.stringify(result);
  }

  close(): void {
    this.process.kill();
  }
}

// --- Module-level state ---

const connections: Map<string, McpConnection> = new Map();
const mcpTools: ToolDefinition[] = [];

/**
 * Load MCP config from .mcc/mcp.json or ~/.mcc/mcp.json
 */
export function loadMcpConfig(cwd?: string): McpConfig | null {
  const resolvedCwd = cwd ?? process.cwd();
  const candidates = [
    path.join(resolvedCwd, ".mcc", "mcp.json"),
    path.join(os.homedir(), ".mcc", "mcp.json"),
  ];

  for (const filePath of candidates) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as McpConfig;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Initialize all MCP servers and discover their tools.
 * Returns ToolDefinition[] that can be registered with the tool system.
 */
export async function initMcp(cwd?: string): Promise<ToolDefinition[]> {
  const config = loadMcpConfig(cwd);
  if (!config?.mcpServers) return [];

  mcpTools.length = 0;

  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    try {
      const conn = new McpConnection(name, serverConfig);
      await conn.initialize();
      const tools = await conn.listTools();
      connections.set(name, conn);

      for (const tool of tools) {
        const mcpToolName = `mcp_${name}_${tool.name}`;
        mcpTools.push({
          name: mcpToolName,
          description: `[MCP: ${name}] ${tool.description || tool.name}`,
          permissionLevel: "execute",
          inputSchema: tool.inputSchema || { type: "object", properties: {} },
          async execute(input: ToolInput): Promise<string> {
            try {
              return await conn.callTool(tool.name, input);
            } catch (err: unknown) {
              const message =
                err instanceof Error ? err.message : String(err);
              return `Error calling MCP tool ${tool.name}: ${message}`;
            }
          },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[MCP] Failed to initialize ${name}: ${message}\n`
      );
    }
  }

  return mcpTools;
}

/**
 * Get currently loaded MCP tools.
 */
export function getMcpTools(): ToolDefinition[] {
  return mcpTools;
}

/**
 * Get active MCP server connection info.
 */
export function getMcpServers(): Array<{ name: string; toolCount: number }> {
  const servers: Array<{ name: string; toolCount: number }> = [];
  for (const [name] of connections) {
    const count = mcpTools.filter((t) =>
      t.name.startsWith(`mcp_${name}_`)
    ).length;
    servers.push({ name, toolCount: count });
  }
  return servers;
}

/**
 * Shut down all MCP connections.
 */
export function closeMcp(): void {
  for (const [, conn] of connections) {
    conn.close();
  }
  connections.clear();
  mcpTools.length = 0;
}
