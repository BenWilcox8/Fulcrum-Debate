import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for the round-driver E2E harness.
 *
 * This is the project's visual-regression backbone: a single spec
 * (`e2e/round-driver.spec.ts`) plays a complete debate round through the real
 * UI headlessly and emits an ordered screenshot sequence. It is deliberately
 * separate from the Vitest unit suite (which is scoped to `src/**` in
 * `vite.config.ts`), so the two never collide.
 *
 * Determinism is the contract: one worker, no retries, a fixed viewport, and a
 * fresh browser context every run (empty IndexedDB → a clean local-first slate),
 * so two consecutive runs walk the identical state sequence.
 */
export default defineConfig({
  testDir: "./e2e",
  // The harness is one long ordered journey; never parallelise or retry it, or
  // the screenshot sequence and the auto-incremented "Round 1"/"Speech 1" titles
  // stop being deterministic.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:1420",
    viewport: { width: 1440, height: 900 },
    // A brand-new context each run: no persisted storageState, so IndexedDB
    // starts empty and the run is reproducible.
    storageState: undefined,
    trace: "off",
    video: "off",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
