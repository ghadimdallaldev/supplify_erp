#!/usr/bin/env node
/**
 * Cross-platform launcher for the local Docker stack.
 * Windows → run-local.ps1 | macOS/Linux → run-local.sh
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cmd = process.argv[2] || "up";
const rest = process.argv.slice(3);

function run(exe, args) {
  const r = spawnSync(exe, args, { stdio: "inherit", shell: process.platform === "win32" });
  process.exit(r.status ?? 1);
}

if (process.platform === "win32") {
  const ps1 = path.join(__dirname, "run-local.ps1");
  run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, cmd, ...rest]);
} else {
  const sh = path.join(__dirname, "run-local.sh");
  if (!existsSync(sh)) {
    console.error("Missing scripts/run-local.sh");
    process.exit(1);
  }
  run("bash", [sh, cmd, ...rest]);
}
