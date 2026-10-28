import { expect, test } from "bun:test";
import { resolvePublic } from "./serve.mjs";

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
