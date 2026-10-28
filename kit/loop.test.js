import { expect, test } from "bun:test";
import { checkTime, MAX_T } from "./loop.js";

test("renderAt time validation rejects non-finite, negative and huge t", () => {
  for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, -1, MAX_T + 1, "abc"]) expect(() => checkTime(bad)).toThrow(RangeError);
  expect(checkTime("6")).toBe(6);
  expect(checkTime(0)).toBe(0);
});
