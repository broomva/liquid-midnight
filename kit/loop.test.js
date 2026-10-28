import { expect, test } from "bun:test";
import { checkTime, MAX_T } from "./loop.js";

test("renderAt time validation rejects non-finite, negative and huge t", () => {
  for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, -1, MAX_T + 1, "abc"]) expect(() => checkTime(bad)).toThrow(RangeError);
  expect(checkTime("6")).toBe(6);
  expect(checkTime(0)).toBe(0);
});

test("reduced motion: the live loop steps every frame but repaints only when invalidated", async () => {
  const { setMotion } = await import("./core.js");
  const { createLoop } = await import("./loop.js");
  const frames = [];
  globalThis.requestAnimationFrame = (f) => frames.push(f);
  globalThis.cancelAnimationFrame = () => {};
  globalThis.document = { documentElement: { style: { setProperty() {} } } };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "40" });
  setMotion(false);
  let paints = 0;
  let steps = 0;
  const loop = createLoop({ step: () => steps++, paint: () => paints++, still: 0.1 });
  loop.start();
  let now = 0;
  const tick = () => frames.shift()((now += 16));
  for (let i = 0; i < 10; i++) tick();
  expect(paints).toBe(1);
  expect(steps).toBeGreaterThanOrEqual(10);
  loop.invalidate();
  tick();
  tick();
  expect(paints).toBe(2);
  setMotion(true);
  tick();
  tick();
  expect(paints).toBe(4);
  loop.stop();
  setMotion(null);
});
