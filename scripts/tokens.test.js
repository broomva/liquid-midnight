import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const tokens = JSON.parse(readFileSync(`${ROOT}tokens/tokens.json`, "utf8"));
const css = readFileSync(`${ROOT}tokens/tokens.css`, "utf8");
const hue = (v) => Number(v.match(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/)[1]);
const chroma = (v) => Number(v.match(/oklch\(\s*[\d.]+\s+([\d.]+)/)[1]);

test("night and day define the same colour roles", () => {
  expect(Object.keys(tokens.color.day).sort()).toEqual(Object.keys(tokens.color.night).sort());
  expect(Object.keys(tokens.color.metal.day).sort()).toEqual(Object.keys(tokens.color.metal.night).sort());
});

test("grounds stay on the Midnight axis: hue 225-262, never purple", () => {
  for (const mode of ["night", "day"])
    for (const k of ["deep", "surface", "elev", "glass", "glassHeavy"]) {
      const v = tokens.color[mode][k].value;
      if (chroma(v) === 0) continue;
      expect(hue(v)).toBeGreaterThanOrEqual(225);
      expect(hue(v)).toBeLessThanOrEqual(262);
    }
});

test("the accent is blue, not violet", () => {
  for (const mode of ["night", "day"]) {
    const h = hue(tokens.color[mode].blue.value);
    expect(h).toBeGreaterThanOrEqual(245);
    expect(h).toBeLessThanOrEqual(260);
  }
});

test("--lm-violet is a low-chroma steel, not a purple", () => {
  for (const mode of ["night", "day"]) expect(chroma(tokens.color[mode].violet.value)).toBeLessThan(0.05);
});

test("every colour token is emitted with a hex fallback and an OKLCH value", () => {
  for (const k of Object.keys(tokens.color.night)) {
    const name = `--lm-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    expect(css).toMatch(new RegExp(`${name}: #[0-9a-f]{6,8};`));
    expect(css).toMatch(new RegExp(`${name}: oklch\\(`));
  }
});

test("reel safe zone matches the platform contract", () => {
  expect(tokens.format.reel.safe).toEqual({ top: 250, bottom: 480, left: 64, right: 150 });
});

test("day mode beats a tone: tone blocks are emitted before the day block in both layers", () => {
  const dayHex = css.indexOf("[data-lm-mode=day] {");
  const dayOk = css.indexOf("  [data-lm-mode=day] {");
  for (const tone of Object.keys(tokens.color.tone)) {
    expect(css.indexOf(`[data-lm-tone=${tone}] {`)).toBeLessThan(dayHex);
    expect(css.indexOf(`  [data-lm-tone=${tone}] {`)).toBeLessThan(dayOk);
  }
});

test("build-tokens has no side effects on import and its hex matches known values", async () => {
  const { oklchToHex } = await import("./build-tokens.mjs");
  expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
  expect(oklchToHex("oklch(0 0 0)")).toBe("#000000");
  expect(oklchToHex("oklch(0.71 0.15 252)")).toBe("#54a5fc");
  expect(oklchToHex("oklch(1 0 0 / 0.5)")).toBe("#ffffff80");
});
