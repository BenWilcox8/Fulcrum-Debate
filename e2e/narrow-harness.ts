import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RoundHarness } from "./harness";

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));

/**
 * Narrow-first screenshot output. Lives in the top-level `e2e-screenshots/`
 * dir, which `.gitignore` already excludes (E2E tester artifacts), so it never
 * collides with the shared harness's `e2e/screenshots/` set and stays out of
 * version control.
 */
export const NARROW_SCREENSHOT_DIR = path.join(DIRNAME, "..", "e2e-screenshots");

/** Primary narrow width - the whole round is driven and judged here. */
export const NARROW_PRIMARY_WIDTH = 1024;
/** Primary narrow height for ordinary screens. */
export const NARROW_PRIMARY_HEIGHT = 768;
/** Spot-check width - a slightly wider narrow to confirm reflow generalises. */
export const SPOT_WIDTH = 1280;
export const SPOT_HEIGHT = 800;
/**
 * Extended height for the flow/round phase. Identical rationale to the shared
 * harness's FLOW_HEIGHT: XYFlow pins/centres the vertical axis, so on a short
 * viewport the lower contentions render below the clipped pane and become
 * unreachable. We keep the NARROW width (1024) - the axis under test - but give
 * the flow enough height to drive every contention. A dedicated `shot(..., {
 * short: true })` additionally captures the *real* 1024x768 viewport so the
 * honest narrow-first experience (including any vertical clipping) is judged.
 */
export const NARROW_FLOW_HEIGHT = 1400;

/**
 * A narrow-first driver: reuses every real-gesture primitive from
 * {@link RoundHarness} but keeps the viewport at NARROW width throughout and
 * writes its own ordered screenshot sequence. This is the Wave-3 narrow-viewport
 * variant - every interaction is performed and captured at 1024 width (with
 * optional 1280 spot-checks and true-768-height captures), so layout reflow,
 * the dock/flow split, dialog fit, toolbar overflow, timer placement, and
 * horizontal overflow are all judged as a real narrow-screen debater sees them.
 *
 * It overrides only the viewport + screenshot machinery; all node/editor/drag
 * gestures are inherited unchanged (they never touch the viewport or the
 * screenshot counter).
 */
export class NarrowRoundHarness extends RoundHarness {
  private nCounter = 0;
  private nHeight = NARROW_PRIMARY_HEIGHT;

  constructor(page: Page) {
    super(page);
  }

  static prepareNarrowDir(): void {
    fs.rmSync(NARROW_SCREENSHOT_DIR, { recursive: true, force: true });
    fs.mkdirSync(NARROW_SCREENSHOT_DIR, { recursive: true });
  }

  private async nSettle(): Promise<void> {
    await this.page.evaluate(() => (document as Document).fonts?.ready).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  /** Set the current phase height at NARROW primary width and apply it. */
  override async setPhaseHeight(height: number): Promise<void> {
    this.nHeight = height;
    await this.page.setViewportSize({ width: NARROW_PRIMARY_WIDTH, height });
    await this.nSettle();
  }

  /**
   * Capture the current state at the NARROW primary viewport.
   *  - `spot: true` also captures at the 1280x800 spot-check width.
   *  - `short: true` also captures at the true 1024x768 height (used on the
   *    flow phase, where the driving height is raised) so the real narrow-screen
   *    view - clipping included - is on record.
   */
  override async shot(slug: string, opts: { spot?: boolean; short?: boolean } = {}): Promise<void> {
    this.nCounter += 1;
    const n = String(this.nCounter).padStart(3, "0");
    // Ensure we are at the phase's narrow primary size before the main capture.
    await this.page.setViewportSize({ width: NARROW_PRIMARY_WIDTH, height: this.nHeight });
    await this.nSettle();
    await this.page.screenshot({ path: path.join(NARROW_SCREENSHOT_DIR, `${n}-${slug}-1024.png`) });

    if (opts.short && this.nHeight !== NARROW_PRIMARY_HEIGHT) {
      await this.page.setViewportSize({ width: NARROW_PRIMARY_WIDTH, height: NARROW_PRIMARY_HEIGHT });
      await this.nSettle();
      await this.page.screenshot({
        path: path.join(NARROW_SCREENSHOT_DIR, `${n}-${slug}-1024x768.png`),
      });
      await this.page.setViewportSize({ width: NARROW_PRIMARY_WIDTH, height: this.nHeight });
      await this.nSettle();
    }

    if (opts.spot) {
      await this.page.setViewportSize({ width: SPOT_WIDTH, height: this.nHeight });
      await this.nSettle();
      await this.page.screenshot({ path: path.join(NARROW_SCREENSHOT_DIR, `${n}-${slug}-1280.png`) });
      await this.page.setViewportSize({ width: NARROW_PRIMARY_WIDTH, height: this.nHeight });
      await this.nSettle();
    }
  }

  /**
   * Assert the page body never scrolls horizontally at the current width - the
   * hard narrow-viewport rule. Returns the overflow delta (0 when clean) so the
   * caller can log it alongside the screenshot it just took.
   */
  async horizontalOverflow(): Promise<number> {
    return this.page.evaluate(() => {
      const el = document.documentElement;
      return Math.max(0, el.scrollWidth - el.clientWidth);
    });
  }
}
