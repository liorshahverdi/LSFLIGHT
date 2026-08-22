import { expect, test, type Page } from "@playwright/test";

/**
 * E2E regression for player controls (FLT-402) through the real game loop.
 * Asserts via the HUD (updates at 5 Hz) — no internals exposed.
 */

async function boot(page: Page) {
  await page.goto("/");
  await expect(page.locator("#hud")).toContainText("ALT");
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

  test("rotate with S and climb (takeoff regression)", async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page);
    await page.keyboard.press("KeyB");
    await page.keyboard.down("ShiftLeft");
    await waitHud(page, (t) => thr(t) >= 99);
    await page.keyboard.up("ShiftLeft");
    // Accelerate to rotation speed.
    await waitHud(page, (t) => ias(t) >= 58, 120_000);
    // Hold nose-up.
    await page.keyboard.down("KeyS");
    await waitHud(page, (t) => alt(t) >= 15, 90_000);
    await page.keyboard.up("KeyS");
    // Still flying and climbing away from the runway.
    await page.waitForTimeout(3000);
    expect(alt(await hud(page))).toBeGreaterThan(12);
    expect(await hud(page)).not.toContain("CRASHED");
  });
});
