// SessionStart hook: runs `npm ci` when package.json or package-lock.json changed
// since the last install (or node_modules is missing). Works on Windows and in
// Linux cloud sessions. npm's own output goes to stderr; stdout (which Claude
// sees) gets one line, and only when something was installed or skipped.
//
// `npm ci` deletes node_modules before installing, so it must never run over a
// working install: on Windows a running `next dev` keeps native binaries open,
// and npm ci then dies halfway, leaving the server on a gutted folder.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const stamp = join(root, "node_modules", ".install-hash");

const hash = createHash("sha256");
for (const file of ["package.json", "package-lock.json"]) hash.update(readFileSync(join(root, file)));
const digest = hash.digest("hex");

if (existsSync(stamp) && readFileSync(stamp, "utf8") === digest) process.exit(0);

const readPackages = (file) => existsSync(file) && JSON.parse(readFileSync(file, "utf8")).packages;
const wanted = readPackages(join(root, "package-lock.json"));
// npm's record of what is installed. It also covers a manual `npm install`, which
// doesn't write our stamp.
const installed = readPackages(join(root, "node_modules", ".package-lock.json"));

if (installed && isCurrent(wanted, installed)) {
  writeFileSync(stamp, digest);
  process.exit(0);
}

const held = heldFile(installed || wanted);
if (held) {
  console.log(`Dependencies are out of date, but npm ci was skipped: ${held} is in use, probably by a running \`next dev\`. Stop it, then run \`npm ci\` in ${root}.`);
  process.exit(0);
}

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

// Same entries as the lockfile, minus optional ones npm skipped (other platforms' binaries).
function isCurrent(wanted, installed) {
  for (const [path, entry] of Object.entries(wanted)) {
    if (path === "" || (entry.optional && !(path in installed))) continue;
    if (JSON.stringify(installed[path]) !== JSON.stringify(entry)) return false;
  }
  return Object.keys(installed).every((path) => path in wanted);
}

// A native binary that another process has loaded, which Windows won't let npm delete.
// Prebuilt binaries ship in os- or cpu-specific packages, so only those are checked.
function heldFile(packages) {
  for (const [path, entry] of Object.entries(packages)) {
    const dir = join(root, path);
    if (!(entry.os || entry.cpu) || !existsSync(dir)) continue;
    for (const file of readdirSync(dir, { recursive: true })) {
      if (!/\.(node|dll|exe)$/i.test(file)) continue;
      try {
        closeSync(openSync(join(dir, file), "r+"));
      } catch (error) {
        if (error.code === "EBUSY" || error.code === "EPERM") return join(path, file);
      }
    }
  }
}
