// Render the specimen to docs/renders/: one PNG per section, night and day, at a fixed t (frames are pure in t).
// bun run render [-- --t 6]

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const tArg = process.argv.indexOf("--t");
const T = tArg > 0 ? Number(process.argv[tArg + 1]) : 6;
if (!Number.isFinite(T) || T < 0 || T > 3600) {
  console.error(`--t must be a finite number of seconds in [0, 3600], got ${process.argv[tArg + 1]}`);
  process.exit(2);
}
const OUT = `${ROOT}docs/renders`;
mkdirSync(OUT, { recursive: true });

const server = serve(0);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
try {
  for (const mode of ["night", "day"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => errors.push(`${mode}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${mode}: ${m.text()}`));
    await page.goto(`http://localhost:${server.port}/specimen/?t=${T}&mode=${mode}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
    for (const id of ["s-hero", "s-palette", "s-type", "s-materials", "s-canvas", "s-breaker", "s-motion", "s-formats"]) {
      const el = page.locator(`#${id}`);
      await el.scrollIntoViewIfNeeded();
      await page.evaluate((t) => window.renderAt(t), T);
      // the whole section, however tall: document-relative clip on a full-page capture, with the fixed HUD hidden
      const b = await el.evaluate((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
      });
      const pad = 40;
      await page.addStyleTag({ content: ".bar{visibility:hidden !important}" });
      await page.screenshot({
        path: `${OUT}/${mode}-${id.slice(2)}.png`,
        fullPage: true,
        clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad },
      });
      console.log(`rendered ${mode}-${id.slice(2)}.png`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.stop(true);
}
if (errors.length) {
  console.error(`page errors:\n${errors.join("\n")}`);
  process.exit(1);
}
