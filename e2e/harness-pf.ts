import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ContentionSeed } from "./seed";
import { RoundHarness, LAPTOP_WIDTH, NARROW_WIDTH, STANDARD_HEIGHT } from "./harness";

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the PUBLIC-FORUM variant's ordered screenshot sequence lands
 * (gitignored, separate from the shared `screenshots/` dir so the two variants
 * never overwrite each other and can be judged side by side).
 */
export const PF_SCREENSHOT_DIR = path.join(DIRNAME, "screenshots-pf");

/**
 * The Public-Forum variant harness. It reuses every *gesture* primitive of the
 * shared {@link RoundHarness} verbatim (column add, C#/S# triggers, drag
 * cross-apply, shift-select, send-to-speech, ...) - the point of the variant is
 * a different round *structure*, not different mechanics - and only overrides
 * the screenshot machinery so captures land in {@link PF_SCREENSHOT_DIR} with
 * their own ordinal counter.
 */
export class PfRoundHarness extends RoundHarness {
  private pfCounter = 0;
  private pfHeight = STANDARD_HEIGHT;

  /** Reset the PF output dir so a run always starts from an empty, ordered set. */
  static preparePfScreenshotDir(): void {
    fs.rmSync(PF_SCREENSHOT_DIR, { recursive: true, force: true });
    fs.mkdirSync(PF_SCREENSHOT_DIR, { recursive: true });
  }

  override async setPhaseHeight(height: number): Promise<void> {
    this.pfHeight = height;
    await super.setPhaseHeight(height);
  }

  /** Small deterministic settle so layout/fonts/animation reach a stable frame. */
  private async pfSettle(): Promise<void> {
    await this.page.evaluate(() => (document as Document).fonts?.ready).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  override async shot(slug: string, opts: { narrow?: boolean } = {}): Promise<void> {
    this.pfCounter += 1;
    const n = String(this.pfCounter).padStart(3, "0");
    await this.pfSettle();
    await this.page.screenshot({ path: path.join(PF_SCREENSHOT_DIR, `${n}-${slug}-laptop.png`) });
    if (opts.narrow) {
      await this.page.setViewportSize({ width: NARROW_WIDTH, height: this.pfHeight });
      await this.pfSettle();
      await this.page.screenshot({ path: path.join(PF_SCREENSHOT_DIR, `${n}-${slug}-narrow.png`) });
      await this.page.setViewportSize({ width: LAPTOP_WIDTH, height: this.pfHeight });
      await this.pfSettle();
    }
  }

  // --- Speech dock ----------------------------------------------------------

  /**
   * Collapse the speech dock so the flow canvas reclaims the full window width.
   *
   * This is a real debater gesture (the dock ships open by default and squeezes
   * the flow to ~58%, pushing the later speech columns off-canvas behind it).
   * The variant collapses it to flow a full, multi-column round comfortably,
   * then reopens it for the Send-Flow step - exactly how a debater would work.
   */
  async collapseDock(): Promise<void> {
    const btn = this.page.getByRole("button", { name: "Close speech dock" });
    if (await btn.count()) {
      await btn.click();
      await this.page.waitForTimeout(200);
    }
  }

  /** Reopen the collapsed speech dock. */
  async openDock(): Promise<void> {
    const btn = this.page.getByRole("button", { name: "Open speech dock" });
    if (await btn.count()) {
      await btn.click();
      await this.page.waitForTimeout(200);
    }
  }

  // --- Horizontal panning ---------------------------------------------------

  /** Bounding box of a speech column's XYFlow node wrapper. */
  private async columnCenterX(index: number): Promise<number> {
    const box = await this.page.locator("[data-testid=speech-column]").nth(index).boundingBox();
    if (!box) throw new Error(`no bounding box for column ${index}`);
    return box.x + box.width / 2;
  }

  /**
   * Pan the flow canvas horizontally by `dx` screen px (positive = shift the
   * content LEFT, revealing right-hand columns) via a wheel event over the pane.
   * The canvas has `panOnScroll` in Free mode, so a horizontal wheel delta pans.
   */
  private async wheelPanX(dx: number): Promise<void> {
    const pane = this.page.locator(".react-flow__pane").first();
    const box = await pane.boundingBox();
    if (!box) throw new Error("no react-flow pane");
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.page.mouse.wheel(dx, 0);
    await this.page.waitForTimeout(150);
  }

  /**
   * Pan so column `index` sits in the timer-clear middle band of the canvas
   * (roughly x∈[250,950]) before flowing into it. The floating timer overlays
   * the top-right of the flow, and a wide multi-column round pushes later
   * columns under it or off-canvas; centring the target column first keeps its
   * contention body a clean click target. Self-correcting: it re-measures and
   * re-pans (flipping direction if a step overshoots) up to a few times.
   */
  async centerColumn(index: number): Promise<void> {
    await this.panColumnToX(index, 560);
  }

  /**
   * Self-correcting horizontal pan that lands column `index`'s centre near
   * screen-x `target`. The wheel-delta→pan mapping (sign and magnitude) is
   * opaque, so it re-measures each step and flips/shrinks the step when one
   * overshoots, converging within a few iterations.
   */
  private async panColumnToX(index: number, target: number): Promise<void> {
    let last = Number.POSITIVE_INFINITY;
    for (let tries = 0; tries < 10; tries += 1) {
      const cx = await this.columnCenterX(index);
      const err = cx - target;
      if (Math.abs(err) <= 120) return;
      if (Math.abs(err) >= Math.abs(last)) {
        // The previous step made it worse (wrong direction) - reverse, smaller.
        await this.wheelPanX(-Math.sign(err) * 150);
      } else {
        await this.wheelPanX(Math.sign(err) * Math.min(Math.abs(err), 400));
      }
      last = err;
    }
  }

  /** Anchor the sheet at the left so column 0 (and its neighbours) are in view. */
  async resetPan(): Promise<void> {
    await this.panColumnToX(0, 200);
  }

  /**
   * Flow a contention into a column after first centring that column clear of
   * the floating timer - the variant's robust wrapper over the shared
   * {@link RoundHarness.flowContention} for a wide, multi-column round.
   */
  async flowColumnCentered(colIndex: number, contention: ContentionSeed): Promise<string> {
    await this.centerColumn(colIndex);
    return this.flowContention(colIndex, contention);
  }
}
