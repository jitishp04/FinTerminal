// SessionStart hook: runs `npm ci` when package.json or package-lock.json changed
// since the last install (or node_modules is missing). Works on Windows and in
// Linux cloud sessions. npm's own output goes to stderr; stdout (which Claude
// sees) gets one line, and only when something was installed.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const stamp = join(root, "node_modules", ".install-hash");

const hash = createHash("sha256");
for (const file of ["package.json", "package-lock.json"]) hash.update(readFileSync(join(root, file)));
const digest = hash.digest("hex");

if (existsSync(stamp) && readFileSync(stamp, "utf8") === digest) process.exit(0);

const result = spawnSync("npm", ["ci", "--no-audit", "--no-fund"], {
  cwd: root,
  stdio: ["ignore", process.stderr, process.stderr],
  // npm is a .cmd shim on Windows, which Node only runs through a shell.
  shell: process.platform === "win32",
});
if (result.status !== 0) {
  console.error(`npm ci failed (exit ${result.status ?? result.error?.message}); run it manually.`);
  process.exit(1);
}
writeFileSync(stamp, digest);
console.log("Installed npm dependencies (package.json or package-lock.json changed).");
