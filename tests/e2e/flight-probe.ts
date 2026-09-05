import { expect, type Page } from "@playwright/test";

export interface FlightSample {
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  att: { x: number; y: number; z: number; w: number };
  rate: number;
  aoa: number;
  crashed: boolean;
  groundPixels: number;
}

declare global {
  interface Window {
    __flightSample: FlightSample;
  }
}

/** Response-only read-only instrumentation. Never changes sim state, clock or inputs.
 * Sample pixels immediately after the real WebGL draw (before buffer discard).
 */
export async function installFlightProbe(page: Page): Promise<void> {
  await page.route("**/src/main.ts", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const marker = "renderer?.sync(ac.body);";
    expect(body).toContain(marker);
    await route.fulfill({
      response,
      body: body.replace(
        marker,
        `${marker}
        const canvas = container.querySelector('canvas');
        const raster = document.createElement('canvas');
        raster.width = 64; raster.height = 40;
        const context = raster.getContext('2d', {willReadFrequently: true});
        let groundPixels = 0;
        if (canvas && context) {
          context.drawImage(canvas, 0, 0, 64, 40);
          const pixels = context.getImageData(0, 0, 64, 40).data;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i+1] > pixels[i]*1.12 && pixels[i+1] > pixels[i+2]*1.15) groundPixels++;
          }
        }
        window.__flightSample = {
          pos: {...ac.body.pos}, vel: {...ac.body.vel}, att: {...ac.body.att},
          rate: ac.body.angVel.x, aoa: ac.lastAirflow.aoaDeg,
          crashed: ac.crashed, groundPixels
        };
      `,
      ),
    });
  });
}

export async function flightSample(page: Page): Promise<FlightSample> {
  return page.evaluate(() => window.__flightSample);
}
