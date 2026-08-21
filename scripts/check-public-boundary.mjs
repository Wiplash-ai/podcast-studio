import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { promisify } from "node:util";

const root = resolve(import.meta.dirname, "..");
const run = promisify(execFile);
const forbiddenExtensions = new Set([
  ".m4a",
  ".mkv",
  ".mov",
  ".mp4",
  ".opus",
  ".wav",
  ".webm",
]);
const forbiddenNames = new Set([".env", ".env.private", "id_rsa", "id_ed25519"]);
const forbiddenPrefixes = ["apps/api/", "apps/worker/", "infra/local/", "infra/madbot/"];
const secretPatterns = [
  { label: "GitHub token", pattern: /gh[opsu]_[A-Za-z0-9_]{30,}/ },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
  { label: "Stripe secret", pattern: /(?:sk_(?:live|test)|rk_(?:live|test)|whsec_)[A-Za-z0-9_]{12,}/ },
  { label: "Google OAuth secret", pattern: /GOCSPX-[A-Za-z0-9_-]{16,}/ },
];

const failures = [];

function isExplicitFixture(value) {
  return /^whsec_(?:fake(?:_|$)|1234567890123456$)/.test(value);
}

async function checkFiles() {
  const { stdout } = await run(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, maxBuffer: 10 * 1024 * 1024 },
  );
  for (const path of stdout.split("\0").filter(Boolean)) {
    if (forbiddenPrefixes.some((prefix) => path.startsWith(prefix))) {
      failures.push(`${path}: private service source is not allowed in the public repository`);
      continue;
    }
    const absolute = resolve(root, path);
    let details;
    try {
      details = await stat(absolute);
    } catch (reason) {
      if (reason && typeof reason === "object" && "code" in reason && reason.code === "ENOENT") {
        continue;
      }
      throw reason;
    }
    if (!details.isFile()) continue;
    const name = basename(path);
    if (
      forbiddenNames.has(name)
      || (name.startsWith(".env") && name !== ".env.example")
      || forbiddenExtensions.has(extname(path).toLowerCase())
    ) {
      failures.push(`${path}: private configuration or media file is not allowed`);
      continue;
    }
    if (details.size > 2_000_000) {
      failures.push(`${path}: file exceeds the two-megabyte public-source limit`);
      continue;
    }
    const content = await readFile(absolute, "utf8");
    for (const { label, pattern } of secretPatterns) {
      const matches = content.match(new RegExp(pattern.source, "g")) ?? [];
      if (matches.some((value) => !isExplicitFixture(value))) {
        failures.push(`${path}: possible ${label}`);
      }
    }
  }
}

await checkFiles();

if (failures.length > 0) {
  process.stderr.write(`Public-boundary check failed:\n${failures.map((item) => `- ${item}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Public-boundary check passed.\n");
}
