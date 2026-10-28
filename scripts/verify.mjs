// Behavioural checks in headless Chromium (the things unit tests cannot see). bun run verify
// 1. tone + day: a day page with a tone keeps paper grounds and dark text (legible);
// 2. reduced motion: the live loop holds t, so the canvases stop changing;
// 3. the orb batch layer overlays its source canvas exactly;
// 4. renderAt(t) is deterministic for a seek reached directly or from later times.
import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const server = serve(0);
const base = `http://127.0.0.1:${server.port}/specimen/`;
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const fails = [];
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) fails.push(msg);
};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => fails.push(`pageerror: ${e.message}`));

  // 1. tone + day
  await page.goto(`${base}?t=2&mode=day`);
  await page.waitForFunction(() => window.__ready === true);
  const tone = await page.evaluate(() => {
    document.documentElement.dataset.lmTone = "graphite";
    const s = getComputedStyle(document.documentElement);
    return { deep: s.getPropertyValue("--lm-deep").trim(), t1: s.getPropertyValue("--lm-t1").trim() };
  });
  check(/0\.968|#f2f5f8/.test(tone.deep) && /0\.22|#191b1d/.test(tone.t1), `day + graphite keeps paper ground (${tone.deep}) and dark text (${tone.t1})`);

  // 3. orb layers overlay their canvases
  const layers = await page.evaluate(() =>
    ["heroCv", "diagCv"].map((id) => {
      const cv = document.getElementById(id);
      const l = cv.nextElementSibling;
      const a = cv.getBoundingClientRect();
      const b = l?.classList.contains("lm-orb-layer") ? l.getBoundingClientRect() : null;
      return { id, ok: !!b && ["x", "y", "width", "height"].every((k) => Math.abs(a[k] - b[k]) < 1) };
    }),
  );
  for (const l of layers) check(l.ok, `orb batch layer overlays #${l.id}`);

  // 4. determinism of renderAt
  const snap = () =>
    page.evaluate(() =>
      ["heroCv", "diagCv", "brkCv", "bg"]
        .map((id) => document.getElementById(id).toDataURL().length + ":" + document.getElementById(id).toDataURL().slice(-64))
        .join("|"),
    );
  await page.evaluate(() => window.renderAt(3));
  const direct = await snap();
  await page.evaluate(() => {
    window.renderAt(5);
    window.renderAt(3);
  });
  check(direct === (await snap()), "renderAt(3) is identical reached directly and via 5 -> 3");

  // 2. reduced motion freezes the live loop
  const rm = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  rm.on("pageerror", (e) => fails.push(`pageerror: ${e.message}`));
  await rm.goto(base);
  await rm.waitForTimeout(800);
  const a = await rm.evaluate(() => document.getElementById("diagCv").toDataURL());
  await rm.waitForTimeout(1200);
  const b = await rm.evaluate(() => document.getElementById("diagCv").toDataURL());
  check(a === b, "reduced motion: the live diagram canvas holds still");
  const live = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await live.goto(base);
  await live.waitForTimeout(800);
  const c = await live.evaluate(() => document.getElementById("diagCv").toDataURL());
  await live.waitForTimeout(1200);
  const d = await live.evaluate(() => document.getElementById("diagCv").toDataURL());
  check(c !== d, "control: with motion on, the live diagram canvas changes");
} finally {
  await browser.close();
  server.stop(true);
}
if (fails.length) {
  console.error(`\n${fails.length} failure(s)`);
  process.exit(1);
}
