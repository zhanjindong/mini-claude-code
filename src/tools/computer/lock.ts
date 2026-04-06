// Computer Use session lock — prevents multiple instances from controlling the desktop simultaneously

import { openSync, writeSync, closeSync, readFileSync, unlinkSync, mkdirSync, constants } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const LOCK_DIR = join(homedir(), ".config", "mcc");
const LOCK_FILE = join(LOCK_DIR, "computer-use.lock");

interface LockInfo {
  pid: number;
  acquiredAt: string;
}

let acquired = false;

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockFile(): LockInfo | null {
  try {
    const content = readFileSync(LOCK_FILE, "utf-8");
    return JSON.parse(content) as LockInfo;
  } catch {
    return null;
  }
}

function removeStaleLock(): void {
  const info = readLockFile();
  if (!info) return;
  if (!isPidAlive(info.pid)) {
    try {
      unlinkSync(LOCK_FILE);
    } catch {
      // ignore
    }
  }
}

/**
 * Try to acquire the computer-use session lock.
 * Returns null on success, or an error message string on failure.
 */
export function tryAcquire(): string | null {
  if (acquired) return null; // re-entrant

  mkdirSync(LOCK_DIR, { recursive: true });
  removeStaleLock();

  const info: LockInfo = {
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
  };

  try {
    const fd = openSync(LOCK_FILE, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
    writeSync(fd, Buffer.from(JSON.stringify(info, null, 2)));
    closeSync(fd);
  } catch (err: any) {
    if (err.code === "EEXIST") {
      const holder = readLockFile();
      if (holder && isPidAlive(holder.pid)) {
        return `Computer Use is locked by another session (PID ${holder.pid}, started ${holder.acquiredAt}). Only one instance can control the desktop at a time.`;
      }
      // Holder is dead but removeStaleLock didn't clean up (race) — retry once
      try {
        unlinkSync(LOCK_FILE);
      } catch {
        return "Computer Use lock is held — please try again.";
      }
      return tryAcquire();
    }
    throw err;
  }

  acquired = true;
  process.on("exit", release);
  return null;
}

/**
 * Release the computer-use session lock.
 */
export function release(): void {
  if (!acquired) return;

  try {
    const info = readLockFile();
    if (info && info.pid === process.pid) {
      unlinkSync(LOCK_FILE);
    }
  } catch {
    // ignore cleanup errors
  }

  acquired = false;
}
