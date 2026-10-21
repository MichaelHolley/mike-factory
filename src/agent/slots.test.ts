import { describe, expect, it } from "vitest";
import { createSlots } from "./slots.ts";

const settled = async (promise: Promise<unknown>) => {
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  return done;
};

describe("slots", () => {
  it("queues keys beyond the limit and hands freed slots out in order", async () => {
    const slots = createSlots(2);
    await slots.acquire(1);
    await slots.acquire(2);
    const third = slots.acquire(3);
    const fourth = slots.acquire(4);
    expect(await settled(third)).toBe(false);

    slots.release(1);
    expect(await settled(third)).toBe(true);
    expect(await settled(fourth)).toBe(false);
  });

  it("lets a key that holds a slot acquire again without waiting", async () => {
    const slots = createSlots(1);
    await slots.acquire(1);
    expect(await settled(slots.acquire(1))).toBe(true);
  });

  it("drops a waiter whose signal aborts, so it never takes a slot", async () => {
    const slots = createSlots(1);
    await slots.acquire(1);
    const controller = new AbortController();
    const aborted = slots.acquire(2, controller.signal);
    const next = slots.acquire(3);
    controller.abort(new Error("stop"));
    await expect(aborted).rejects.toThrow("stop");

    slots.release(1);
    expect(await settled(next)).toBe(true);
  });
});
