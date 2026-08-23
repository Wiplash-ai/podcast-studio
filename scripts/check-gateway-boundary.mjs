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

const contentSecurityPolicy = gateway.match(
  /add_header Content-Security-Policy "([^"]+)" always;/,
)?.[1] ?? "";
const requiredCspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https: wss:",
  "media-src 'self' blob: https:",
  "frame-src 'self' https://vdo.ninja",
  "worker-src 'self' blob:",
  "child-src 'self' blob: https://vdo.ninja",
  "manifest-src 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
];
if (!contentSecurityPolicy) missing.push("Content-Security-Policy response header");
for (const directive of requiredCspDirectives) {
  if (!contentSecurityPolicy.split("; ").includes(directive)) {
    missing.push(`CSP directive ${directive}`);
  }
}
const scriptPolicy = contentSecurityPolicy
  .split("; ")
  .find((directive) => directive.startsWith("script-src ")) ?? "";
if (/unsafe-inline|unsafe-eval/.test(scriptPolicy)) {
  missing.push("CSP must block inline and evaluated scripts");
}

if (missing.length > 0) {
  process.stderr.write(`Gateway boundary check failed:\n${missing.map((entry) => `- missing ${entry}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Gateway boundary check passed.\n");
}
