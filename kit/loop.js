// Liquid Midnight render kit · the frame loop and the render contract.
// Contract (from the keynote's capture mode, deck/index.html @187972f lines 2760 and 2810-2822): every frame is a pure
// function of t. State that integrates (springs, particles) is advanced in fixed 1/60 s steps from t = 0, the PRNG is
// reseeded at t = 0, and the rim angle is derived from t, so window.renderAt(t) paints the same pixels on every machine
// and a headless browser can render any frame to video.
import { MOTION, reseed } from "./core.js";

export const STEP = 1 / 60;

/** Set the travelling liquid-metal angle for every .lm-glass / .lm-capsule / .lm-ring rim. 40°/s by default. */
export function setUA(t, el = document.documentElement, degPerSecond = 40) {
  el.style.setProperty("--ua", `${((t * degPerSecond) % 360).toFixed(1)}deg`);
}

/**
 * createLoop({ init, step, paint, seed })
 *  init()           reset scene state (called at t = 0 and before every backwards seek)
 *  step(dt, t)      advance integrating state by one fixed step (springs, flows)
 *  paint(t)         draw the frame for time t (pure: reads state + t)
 * Returns { start(), stop(), renderAt(t), t }.
 */
export function createLoop({ init = () => {}, step = () => {}, paint = () => {}, seed = 0x5eed } = {}) {
  let t = 0;
  let n = 0;
  let raf = 0;
  let last = 0;
  let acc = 0;
  const reset = () => {
    reseed(seed);
    t = 0;
    n = 0;
    acc = 0;
    init();
  };
  const frame = (tt) => {
    setUA(MOTION ? tt : 0);
    paint(tt);
  };
  const L = {
    get t() {
      return t;
    },
    /** deterministic seek: replays fixed steps from 0 when going backwards */
    renderAt(target) {
      const N = Math.max(0, Math.round(target / STEP));
      if (N < n) reset();
      while (n < N) {
        step(STEP, t);
        t += STEP;
        n++;
      }
      frame(t);
    },
    /** real-time preview: same fixed steps, driven by requestAnimationFrame */
    start() {
      if (raf) return;
      reset();
      last = performance.now();
      const tick = (now) => {
        acc += Math.min(0.1, (now - last) / 1000);
        last = now;
        while (acc >= STEP) {
          step(STEP, t);
          t += STEP;
          n++;
          acc -= STEP;
        }
        frame(t);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
  reset();
  return L;
}
