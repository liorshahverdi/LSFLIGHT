import { expect, test, type Page } from "@playwright/test";
import { validateMeshDoc } from "../../packages/render/src/mesh.js";
import { flightSample, installFlightProbe, type FlightSample } from "./flight-probe.js";

/**
 * E2E regression for player controls (FLT-402) through the real game loop.
 * Asserts via the HUD (updates at 5 Hz) — no internals exposed.
 */

async function boot(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const modelResponse = page.waitForResponse((response) =>
    response.url().endsWith("/e2e/models/cessna172r.mesh.json"),
  );
  await page.goto("./");
  const response = await modelResponse;
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/json");
  const doc = await response.json();
  expect(validateMeshDoc(doc)).toBe(true);
  await expect(page.locator("#app")).toHaveAttribute("data-model-state", "ready");
  // onAfterRender only runs for the accepted converted mesh, not the placeholder.
  await expect(page.locator("#app")).toHaveAttribute(
    "data-model-triangles-rendered",
    String(doc.indices.length / 3),
  );
  await expect(page.locator("#app canvas")).toBeVisible();
  await expect(page.locator("#hud")).toContainText("MODEL: Cessna 172R");
  expect(errors).toEqual([]);
  return errors;
}

async function hud(page: Page): Promise<string> {
  return (await page.locator("#hud").textContent()) ?? "";
}

/** Poll until the predicate matches the HUD text. */
async function waitHud(
  page: Page,
  pred: (t: string) => boolean,
  timeoutMs = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let t = await hud(page);
  while (Date.now() < deadline) {
    if (pred(t)) return t;
    await page.waitForTimeout(250);
    t = await hud(page);
  }
  throw new Error(`HUD condition not met within ${timeoutMs}ms. Last: ${t}`);
}

function thr(t: string): number {
  const m = t.match(/THR\s+(\d+)%/);
  return m ? parseInt(m[1] as string, 10) : -1;
}
function ias(t: string): number {
  const m = t.match(/IAS\s+(\d+)/);
  return m ? parseInt(m[1] as string, 10) : -1;
}
function alt(t: string): number {
  const m = t.match(/ALT\s+(-?\d+)/);
  return m ? parseInt(m[1] as string, 10) : -99999;
}

test.describe("flight controls regression", () => {
  test("boots parked with brakes set", async ({ page }) => {
    await boot(page);
    const t = await waitHud(page, (x) => x.includes("THR"));
    expect(t).toContain("BRAKES SET");
    expect(thr(t)).toBe(0);
    expect(ias(t)).toBe(0);
  });

  test("B toggles brakes off and on", async ({ page }) => {
    await boot(page);
    await page.keyboard.press("KeyB");
    await waitHud(page, (t) => t.includes("ROLLING"));
    await page.keyboard.press("KeyB");
    await waitHud(page, (t) => t.includes("BRAKES SET"));
  });

  test("Shift/Ctrl adjust persistent throttle", async ({ page }) => {
    await boot(page);
    await page.keyboard.down("ShiftLeft");
    await waitHud(page, (t) => thr(t) >= 40);
    await page.keyboard.up("ShiftLeft");
    // Persistent after release.
    await page.waitForTimeout(600);
    expect(thr(await hud(page))).toBeGreaterThanOrEqual(40);
    await page.keyboard.down("ControlLeft");
    await waitHud(page, (t) => thr(t) <= 10);
    await page.keyboard.up("ControlLeft");
  });

  test("full throttle accelerates the aircraft on the runway", async ({ page }) => {
    await boot(page);
    await page.keyboard.press("KeyB"); // release brakes
    await page.keyboard.down("ShiftLeft");
    await waitHud(page, (t) => thr(t) >= 99);
    await page.keyboard.up("ShiftLeft");
    await waitHud(page, (t) => ias(t) >= 40, 90_000);
  });

  test("rotate with S and sustain safe climb after release (takeoff regression)", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await installFlightProbe(page);
    const errors = await boot(page);
    const samples: FlightSample[] = [];
    await expect.poll(async () => (await flightSample(page)).groundPixels).toBeGreaterThan(50);
    await page.screenshot({ path: testInfo.outputPath("parked-assembled-ground.png") });
    await page.keyboard.press("KeyB");
    await page.keyboard.down("ShiftLeft");
    await waitHud(page, (t) => thr(t) >= 99);
    await page.keyboard.up("ShiftLeft");
    // Accelerate to rotation speed.
    await waitHud(page, (t) => ias(t) >= 20, 120_000);
    expect((await flightSample(page)).groundPixels).toBeGreaterThan(50);
    await page.screenshot({ path: testInfo.outputPath("taxi-ground.png") });
    await waitHud(page, (t) => ias(t) >= 58, 120_000);
    const rotation = await flightSample(page);
    expect(rotation.groundPixels).toBeGreaterThan(500);
    await page.screenshot({ path: testInfo.outputPath("rotation-outside-strip-ground.png") });
    // Hold nose-up.
    await page.keyboard.down("KeyS");
    await waitHud(page, (t) => alt(t) >= 15, 90_000);
    await page.keyboard.up("KeyS");
    const released = await flightSample(page);
    samples.push(released);
    // Normal wall time, no accelerated clock. The old 3 s gate missed a loop/crash.
    const releaseTime = Date.now();
    while (Date.now() - releaseTime < 20_000) {
      await page.waitForTimeout(250);
      const s = await flightSample(page);
      samples.push(s);
      expect(s.crashed).toBe(false);
      expect(s.pos.y).toBeGreaterThan(released.pos.y);
      expect(s.vel.y).toBeGreaterThan(0);
      expect(s.aoa).toBeLessThan(16);
      const upY = 1 - 2 * (s.att.x ** 2 + s.att.z ** 2);
      expect(upY).toBeGreaterThan(Math.cos(Math.PI / 6));
      expect(Math.abs(s.rate)).toBeLessThan(0.2);
      if (Date.now() - releaseTime > 4000) expect(Math.abs(s.rate)).toBeLessThan(0.03);
    }
    expect(alt(await hud(page))).toBeGreaterThan(150);
    expect((await flightSample(page)).groundPixels).toBeGreaterThan(500);
    await page.screenshot({ path: testInfo.outputPath("airborne-20s-assembled-ground.png") });
    await testInfo.attach("takeoff-samples", {
      body: JSON.stringify(samples, null, 2),
      contentType: "application/json",
    });
    expect(await hud(page)).not.toContain("CRASHED");
    expect(errors).toEqual([]);
  });
});

test.describe("model load failures are explicit", () => {
  for (const failure of ["http", "invalid mesh", "invalid json"] as const) {
    test(failure, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/models/cessna172r.mesh.json", (route) =>
        route.fulfill({
          status: failure === "http" ? 404 : 200,
          contentType: "application/json",
          body:
            failure === "invalid json"
              ? "not json"
              : JSON.stringify({ positions: [0, 0, 0], colors: [1, 1, 1], indices: [-1, 0, 0] }),
        }),
      );
      await page.goto("./");
      await expect(page.locator("#app")).toHaveAttribute("data-model-state", "failed");
      await expect(page.locator("#hud")).toContainText("MODEL: load failed (placeholder)");
      await expect(page.locator("#app")).not.toHaveAttribute("data-model-triangles-rendered", /.+/);
      expect(errors).toEqual([]);
    });
  }

  test("WebGL unavailable stays safe and does not claim model acceptance", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
    await page.goto("./");
    await expect(page.locator("#app")).toHaveAttribute("data-model-state", "unavailable");
    await expect(page.locator("#hud")).toContainText("MODEL: WebGL unavailable (HUD only)");
    await expect(page.locator("#app canvas")).toHaveCount(0);
    await page.keyboard.press("KeyB");
    await expect(page.locator("#hud")).toContainText("ROLLING");
    expect(errors).toEqual([]);
  });
});
