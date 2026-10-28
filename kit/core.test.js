import { expect, test } from "bun:test";
import { beat, bz, clamp, hc, R0, reseed, Sp, setMotion } from "./core.js";

test("seeded PRNG is deterministic per seed", () => {
  reseed(42);
  const a = [R0(), R0(), R0()];
  reseed(42);
  expect([R0(), R0(), R0()]).toEqual(a);
});

test("critically damped spring settles at the target without overshoot", () => {
  setMotion(true);
  const s = new Sp(0).set(1);
  let max = 0;
  for (let i = 0; i < 240; i++) max = Math.max(max, s.step(1 / 60, 0.5, 1));
  expect(s.v).toBeCloseTo(1, 4);
  expect(max).toBeLessThanOrEqual(1 + 1e-6);
});

test("under-damped spring overshoots slightly", () => {
  setMotion(true);
  const s = new Sp(0).set(1);
  let max = 0;
  for (let i = 0; i < 240; i++) max = Math.max(max, s.step(1 / 60, 0.8, 0.9));
  expect(max).toBeGreaterThan(1);
  expect(max).toBeLessThan(1.01);
});

test("reduced motion snaps springs to the target", () => {
  setMotion(false);
  expect(new Sp(0).set(1).step(1 / 60)).toBe(1);
  setMotion(true);
});

test("spring step is frame-rate independent within tolerance", () => {
  const a = new Sp(0).set(1);
  const b = new Sp(0).set(1);
  for (let i = 0; i < 30; i++) a.step(1 / 60);
  for (let i = 0; i < 15; i++) b.step(1 / 30);
  expect(Math.abs(a.v - b.v)).toBeLessThan(0.01);
});

test("bézier helpers hit their endpoints and beats clamp", () => {
  const p = hc([0, 0], [100, 50]);
  expect(bz(p, 0)).toEqual([0, 0]);
  expect(bz(p, 1)).toEqual([100, 50]);
  expect(beat(-1, 0, 1)).toBe(0);
  expect(beat(5, 0, 1)).toBe(1);
  expect(clamp(2, 0, 1)).toBe(1);
});
