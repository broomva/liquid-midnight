// Static server for the specimen (ES modules need http, not file://). bun run serve → http://localhost:4317/specimen/
import { join, normalize } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
export function serve(port = Number(process.env.PORT) || 4317) {
  return Bun.serve({
    port,
    fetch(req) {
      const path = normalize(decodeURIComponent(new URL(req.url).pathname));
      if (path.includes("..")) return new Response("forbidden", { status: 403 });
      const file = Bun.file(join(ROOT, path.endsWith("/") ? `${path}index.html` : path));
      return file.size ? new Response(file) : new Response("not found", { status: 404 });
    },
  });
}
if (import.meta.main) {
  const s = serve();
  console.log(`specimen: http://localhost:${s.port}/specimen/`);
}
