// Static server for the specimen (ES modules need http, not file://). bun run serve → http://localhost:4317/specimen/
// Loopback only; serves only the public asset directories below, never dotfiles or the rest of the repo.
import { join, normalize, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
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
        return (await f.exists()) ? new Response(f) : new Response("not found", { status: 404 });
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
