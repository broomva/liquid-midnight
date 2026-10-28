import { expect, test } from "bun:test";
import { resolvePublic } from "./serve.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

test("serves public asset directories", () => {
  expect(resolvePublic("/specimen/")).toMatch(/specimen\/index\.html$/);
  expect(resolvePublic("/kit/core.js")).toMatch(/kit\/core\.js$/);
});

test("refuses dotfiles, traversal, malformed escapes and the rest of the repo", () => {
  for (const p of [
    "/.git/config",
    "/.env",
    "/specimen/../.git/config",
    "/%2e%2e/%2e%2e/etc/passwd",
    "/specimen/%E0%A4%A",
    "/package.json",
    "/scripts/serve.mjs",
    "/design/liquid-midnight.pen",
  ])
    expect(resolvePublic(p)).toBeNull();
});

test("refuses dotfiles inside public directories", () => {
  for (const p of ["/docs/.env", "/kit/.hidden.js", "/specimen/.DS_Store"]) expect(resolvePublic(p)).toBeNull();
});

test("refuses NUL and control characters", () => {
  for (const p of ["/kit/a%00b", "/kit/a%0Ab.js", "/specimen/%7F"]) expect(resolvePublic(p)).toBeNull();
});

test("rejects foreign Host headers (DNS rebinding) and non-GET methods", async () => {
  const { serve } = await import("./serve.mjs");
  const s = serve(0);
  try {
    const url = `http://127.0.0.1:${s.port}/specimen/`;
    expect((await fetch(url)).status).toBe(200);
    expect((await fetch(url, { headers: { host: "evil.example" } })).status).toBe(403);
    expect((await fetch(url, { method: "POST" })).status).toBe(405);
  } finally {
    s.stop(true);
  }
});

test("a symlink inside a public directory cannot escape it", async () => {
  const { symlinkSync, unlinkSync, writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { serve } = await import("./serve.mjs");
  const secret = `${mkdtempSync(`${tmpdir()}/lm-sec-`)}/secret.txt`;
  writeFileSync(secret, "secret");
  const link = `${ROOT}specimen/zz-leak-test.txt`;
  symlinkSync(secret, link);
  const s = serve(0);
  try {
    expect((await fetch(`http://127.0.0.1:${s.port}/specimen/zz-leak-test.txt`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${s.port}/specimen/`)).status).toBe(200);
  } finally {
    s.stop(true);
    unlinkSync(link);
  }
});
