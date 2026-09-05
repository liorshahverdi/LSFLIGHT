import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 5176);
const baseURL = `http://127.0.0.1:${port}/e2e/`;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: process.env.E2E_OUTPUT_DIR ?? "test-results",
  timeout: 240_000, // flight tests are real-time
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    baseURL,
    launchOptions: {
      args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
    },
  },
  webServer: {
    command: `npx vite --config packages/app/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort --base /e2e/`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
