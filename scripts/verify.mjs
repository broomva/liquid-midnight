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
  // nested: day on <html>, a tone on a descendant (and the reverse) must still resolve to the day grounds
  const nested = await page.evaluate(() => {
    const html = document.documentElement;
    delete html.dataset.lmTone;
    document.body.dataset.lmTone = "graphite";
    const main = document.querySelector("main");
    main.dataset.lmTone = "abyss";
    const s1 = getComputedStyle(document.body).getPropertyValue("--lm-deep").trim();
    const s2 = getComputedStyle(main).getPropertyValue("--lm-deep").trim();
    delete document.body.dataset.lmTone;
    delete main.dataset.lmTone;
    html.dataset.lmMode = "night";
    html.dataset.lmTone = "graphite";
    main.dataset.lmMode = "day";
    const s3 = getComputedStyle(main).getPropertyValue("--lm-deep").trim();
    delete html.dataset.lmTone;
    delete main.dataset.lmMode;
    html.dataset.lmMode = "day";
    return [s1, s2, s3];
  });
  check(
    nested.every((v) => /0\.968|#f2f5f8/.test(v)),
    `day wins over tones on any element (${nested.join(" | ")})`,
  );

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

  // 3b. layer lifecycle: unmounted canvases release their layers; a layer follows its canvas's opacity
  const life = await page.evaluate(async () => {
    const { ORB, orb, use, C } = await import("../kit/index.js");
    const host = document.createElement("div");
    host.style.position = "relative";
    document.body.append(host);
    for (let i = 0; i < 20; i++) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      host.append(cv);
      const x = cv.getContext("2d");
      use(x);
      ORB.attach(cv);
      ORB.begin(x);
      orb(32, 32, 20, C.blue, 1);
      ORB.end();
      cv.remove();
    }
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    cv.style.opacity = "0.25";
    host.append(cv);
    ORB.attach(cv);
    const op = cv.nextElementSibling.style.opacity;
    const n = ORB.layers;
    // unmount with no further attach(): the MutationObserver must release it on its own. Mute the page's repaint
    // hook first: a repaint would call attach() and prune the canvas through the old path, hiding a regression.
    ORB.onChange(() => {});
    await new Promise((r) => setTimeout(r, 100));
    const solo = document.createElement("canvas");
    solo.width = solo.height = 64;
    host.append(solo);
    ORB.attach(solo);
    const before = ORB.layers;
    solo.remove();
    await new Promise((r) => setTimeout(r, 50));
    const autoReleased = ORB.layers === before - 1;
    ORB.detach(cv);
    host.remove();
    return { n, op, after: ORB.layers, ok: ORB.ok, autoReleased };
  });
  check(
    life.n <= 3 && life.after <= 2 && life.ok,
    `orb layers are released on unmount (live ${life.n}, after detach ${life.after}, sprite renderer ok ${life.ok})`,
  );
  check(life.op === "0.25", `orb layer mirrors its canvas opacity (${life.op})`);
  check(life.autoReleased, "an unmounted canvas releases its orb layer without another attach()");

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

  // 2. reduced motion freezes the live loop (close the first page so two renderers don't compete for swiftshader)
  await page.close();
  const rm = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  rm.on("pageerror", (e) => fails.push(`pageerror: ${e.message}`));
  await rm.goto(base);
  await rm.waitForTimeout(800);
  const a = await rm.evaluate(() => document.getElementById("diagCv").toDataURL());
  await rm.waitForTimeout(1200);
  const b = await rm.evaluate(() => document.getElementById("diagCv").toDataURL());
  check(a === b, "reduced motion: the live diagram canvas holds still");
  const settled = await rm.evaluate(() => ({
    counters: ["cA", "cB", "cC"].map((id) => document.getElementById(id).textContent),
    thumb: document.querySelector("#modeSeg .lm-thumb").getBoundingClientRect().width,
    motionPressed: document.getElementById("motionBtn").getAttribute("aria-pressed"),
  }));
  check(settled.counters.join() === "128,096,032", `reduced motion shows the settled state, not t=0 (counters ${settled.counters.join(" ")})`);
  check(settled.thumb > 20, `reduced motion: the segmented thumb is laid out (${settled.thumb.toFixed(0)} px)`);
  check(settled.motionPressed === "false", "the Motion control reflects the OS reduced-motion setting");
  await rm.click('#modeSeg button[data-mode="day"]');
  const moved = await rm
    .waitForFunction(
      () => {
        const t = document.querySelector("#modeSeg .lm-thumb").getBoundingClientRect();
        const b = document.querySelector('#modeSeg button[data-mode="day"]').getBoundingClientRect();
        return Math.abs(t.left - b.left) < 2 && document.documentElement.dataset.lmMode === "day";
      },
      null,
      { timeout: 5000 },
    )
    .then(() => true)
    .catch(() => false);
  check(moved, "reduced motion: clicking Day snaps the thumb to it and switches the mode");
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
