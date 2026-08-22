import { describe, it, expect, beforeEach } from "vitest";
import { KeyboardAxes, type KeyStateSource } from "../src/keyboard.js";

const DT = 1 / 60;
// Fake key state source so tests don't need a DOM.
function makeFake(pressed: Set<string>) {
  return {
    isDown: (code: string) => pressed.has(code),
  } as KeyStateSource;
}

describe("Keyboard axes -> ControlInput (FLT-402)", () => {
  let pressed: Set<string>;
  let k: KeyboardAxes;
  beforeEach(() => {
    pressed = new Set();
    k = new KeyboardAxes(makeFake(pressed));
  });

  it("starts neutral", () => {
    const c = k.sample(DT);
    expect(c.elevator).toBe(0);
    expect(c.aileron).toBe(0);
    expect(c.rudder).toBe(0);
    expect(c.throttle).toBe(0);
  });

  it("S (nose up) ramps elevator positive; W ramps negative", () => {
    pressed.add("KeyS");
    let c;
    for (let i = 0; i < 30; i++) c = k.sample(DT);
    expect(c!.elevator).toBeCloseTo(1, 1); // full throw in ~0.5 s
    pressed.clear();
    const k2 = new KeyboardAxes(makeFake(new Set(["KeyW"])));
    for (let i = 0; i < 30; i++) c = k2.sample(DT);
    expect(c!.elevator).toBeCloseTo(-1, 1);
  });

  it("released keys decay back to center", () => {
    pressed.add("KeyS");
    for (let i = 0; i < 30; i++) k.sample(DT);
    pressed.clear();
    let c;
    for (let i = 0; i < 30; i++) c = k.sample(DT);
    expect(c!.elevator).toBe(0);
  });

  it("A/D map to roll, Q/E to yaw", () => {
    pressed.add("KeyD");
    pressed.add("KeyQ");
    let c;
    for (let i = 0; i < 30; i++) c = k.sample(DT);
    expect(c!.aileron).toBeCloseTo(1, 1); // D = roll right
    expect(c!.rudder).toBeCloseTo(-1, 1); // Q = yaw left
  });

  it("Shift/Ctrl adjust a persistent throttle value", () => {
    pressed.add("ShiftLeft");
    let c;
    for (let i = 0; i < 60; i++) c = k.sample(DT); // 1 s
    expect(c!.throttle).toBeCloseTo(0.5, 1);
    pressed.clear();
    pressed.add("ControlLeft");
    for (let i = 0; i < 30; i++) c = k.sample(DT);
    expect(c!.throttle).toBeLessThan(0.5);
    pressed.clear();
    c = k.sample(DT);
    expect(c!.throttle).toBeGreaterThan(0); // persists
  });

  it("throttle clamps to [0,1]", () => {
    pressed.add("ShiftLeft");
    let c;
    for (let i = 0; i < 600; i++) c = k.sample(DT);
    expect(c!.throttle).toBe(1);
  });
});
