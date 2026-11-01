// Fails if a value from .env.local reached the files sent to the browser. Run it after `npm run build`.
// It reports names and paths, never a value.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const NAMES = ["FRED_API_KEY", "FINNHUB_API_KEY", "SEC_USER_AGENT"];
const CLIENT_FILES = ".next/static";

if (!existsSync(CLIENT_FILES)) {
  console.error("Nothing to check: run `npm run build` first.");
  process.exit(1);
}

const env = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
const secrets = NAMES.flatMap((name) => {
  const value = env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
  return value ? [{ name, value }] : [];
});

const files = readdirSync(CLIENT_FILES, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name));

const leaks = files.flatMap((file) => {
  const contents = readFileSync(file);
  return secrets.filter(({ value }) => contents.includes(value)).map(({ name }) => `${name} is in ${file}`);
});

console.log(`Checked ${files.length} files for ${secrets.length} of ${NAMES.length} values.`);
if (leaks.length > 0) {
  console.error(leaks.join("\n"));
  process.exit(1);
}
console.log("No key values found.");
