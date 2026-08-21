import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const gateway = await readFile(resolve(import.meta.dirname, "../deploy/nginx.conf"), "utf8");
const required = [
  "location ^~ /internal/",
  "return 404",
  "location /v1/",
  "proxy_pass http://api:8788",
  "location = /healthz",
  "try_files $uri $uri/ /index.html",
];

const missing = required.filter((entry) => !gateway.includes(entry));
if (missing.length > 0) {
  process.stderr.write(`Gateway boundary check failed:\n${missing.map((entry) => `- missing ${entry}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Gateway boundary check passed.\n");
}
