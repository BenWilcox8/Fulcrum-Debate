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
 *
 * The same spec doubles as the visual-regression check (`npm run round:vrt`,
 * ROUND_VRT=1): each captured state is asserted against a committed baseline
 * (`e2e/baselines/<platform>/…`) via Playwright's `toHaveScreenshot` instead of
 * being written to disk. See README ("Visual-regression baselines") for how to
 * intentionally refresh the baselines when the UI changes on purpose.
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
  // Committed baselines are platform-rendered: font rasterisation differs across
  // OSes, so the darwin baselines only match a darwin run. Nesting the platform
  // keeps that explicit and makes a future CI-on-Linux promotion regenerate its
  // own set rather than silently diffing against darwin.
  snapshotPathTemplate: "e2e/baselines/{platform}/{arg}{ext}",
  expect: {
    timeout: 15_000,
    // The VRT threshold is deliberately tight and NOT a loose global escape
    // hatch: `threshold` (per-pixel YIQ distance) absorbs sub-pixel text
    // anti-aliasing, and a small absolute `maxDiffPixels` swallows the handful
    // of residual differing pixels the harness documents (~a few hundred at
    // worst across two runs) while still catching a real 1px-scale CSS change
    // (which perturbs far more). Genuinely nondeterministic regions (the timer
    // clock digits) are masked at the call site, not hidden behind this number.
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      threshold: 0.2,
      maxDiffPixels: 120,
    },
  },
  use: {
    baseURL: "http://localhost:1420",
    viewport: { width: 1440, height: 900 },
    // Pin the raster pipeline so captures are reproducible run-to-run (and, as
    // far as font hinting allows, machine-to-machine): a 1x backing store, sRGB
    // colour, and no font hinting (hinting is the biggest source of per-run
    // glyph-edge jitter).
    deviceScaleFactor: 1,
    launchOptions: {
      args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text"],
    },
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
