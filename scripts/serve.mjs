// Static server for the specimen (ES modules need http, not file://). bun run serve → http://localhost:4317/specimen/
// Loopback only; serves only the public asset directories below, never dotfiles or the rest of the repo.

import { realpathSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC = ["specimen", "tokens", "css", "kit", "fonts", "design/shaders", "docs"];

export function resolvePublic(urlPath) {
  let path;
  try {
    path = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if ([...path].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) return null; // NUL and control characters
  const rel = normalize(path).replace(/^[/\\]+/, "");
  const parts = rel.split(/[/\\]/);
  if (parts.some((p) => p === ".." || p.startsWith("."))) return null;
  const relPath = parts.join("/");
  if (!PUBLIC.some((d) => relPath === d || relPath.startsWith(`${d}/`))) return null;
  return join(ROOT, rel.endsWith(sep) || rel.endsWith("/") || PUBLIC.includes(relPath) ? join(rel, "index.html") : rel);
}

export function serve(port = Number(process.env.PORT) || 4317) {
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    development: false, // never Bun's dev error page (it embeds paths and source)
    async fetch(req) {
      if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
      const host = (req.headers.get("host") || "").replace(/:\d+$/, "");
      if (host !== "127.0.0.1" && host !== "localhost") return new Response("forbidden", { status: 403 }); // DNS rebinding
      try {
        const file = resolvePublic(new URL(req.url).pathname);
        if (!file) return new Response("not found", { status: 404 });
        const f = Bun.file(file);
        if (!(await f.exists())) return new Response("not found", { status: 404 });
        // a symlink inside a public directory must not lead outside the repo (e.g. specimen/leak -> ../.env)
        const real = realpathSync(file);
        const root = realpathSync(ROOT);
        const rel = real
          .slice(root.length + 1)
          .split(sep)
          .join("/");
        if (!real.startsWith(root + sep) || !PUBLIC.some((d) => rel === d || rel.startsWith(`${d}/`)) || rel.split("/").some((p) => p.startsWith(".")))
          return new Response("not found", { status: 404 });
        return new Response(Bun.file(real));
      } catch {
        return new Response("not found", { status: 404 });
      }
    },
    error() {
      return new Response("not found", { status: 404 });
    },
  });
}
if (import.meta.main) {
  const s = serve();
  console.log(`specimen: http://127.0.0.1:${s.port}/specimen/`);
}
