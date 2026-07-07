import { expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentionSeed } from "./seed";

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));

/** Where the ordered screenshot sequence lands (gitignored). */
export const SCREENSHOT_DIR = path.join(DIRNAME, "screenshots");

/** Primary laptop width - every `-laptop` screenshot is captured at this width. */
export const LAPTOP_WIDTH = 1440;
/** Narrow width - `-narrow` screenshots prove the responsive layout. */
export const NARROW_WIDTH = 1024;
/** Standard laptop height for ordinary screens. */
export const STANDARD_HEIGHT = 900;
/**
 * Extended height used only for the round/flow screen. A flow sheet is an
 * inherently tall surface: the app vertically centres the flow (XYFlow
 * `translateExtent` pins the vertical axis) so the column contentions render
 * below a short viewport's clipped pane. A taller viewport keeps every
 * contention on-canvas and interactable, at the same 1440 laptop width.
 */
export const FLOW_HEIGHT = 1400;

/** Back-compat alias: the default laptop viewport. */
export const LAPTOP = { width: LAPTOP_WIDTH, height: STANDARD_HEIGHT } as const;

/**
 * Drives Fulcrum's real UI through a complete debate round, capturing an
 * ordered, chronologically-named screenshot sequence.
 *
 * Every method here is a *real user gesture* - never an API shortcut. The tricky
 * parts (validated against the live app before this landed):
 *  - XYFlow column/contention nodes sit under the `react-flow__pane`, which
 *    intercepts hit-testing, so node *activation* is a dispatched `click` that
 *    bubbles to React's delegated listener rather than a positional click.
 *  - The C# contention trigger is a document-wide keydown that ignores editable
 *    targets, so we blur the column-label input (click the heading) before
 *    typing `C1`+Enter.
 *  - The floating Timer widget overlays the top-right of the flow pane, so
 *    form submits go through Enter, not a click on the covered button.
 *  - Node drag is d3-drag (real mouse events), driven with a stepped
 *    mouse.move/down/up traversal.
 */
export class RoundHarness {
  private counter = 0;
  /** Current laptop-viewport height; the round phase raises it (see FLOW_HEIGHT). */
  private laptopHeight = STANDARD_HEIGHT;

  constructor(readonly page: Page) {}

  /**
   * Set the laptop-viewport height for the current phase (e.g. FLOW_HEIGHT for
   * the round screen, STANDARD_HEIGHT elsewhere) and apply it immediately.
   */
  async setPhaseHeight(height: number): Promise<void> {
    this.laptopHeight = height;
    await this.page.setViewportSize({ width: LAPTOP_WIDTH, height });
    await this.settle();
  }

  /** Reset the output dir so a run always starts from an empty, ordered set. */
  static prepareScreenshotDir(): void {
    fs.rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  /**
   * Capture the current state. Always writes `NNN-<slug>-laptop.png`; when
   * `narrow` is set, also captures `NNN-<slug>-narrow.png` at the narrow
   * viewport (same ordinal - it is the same state, two widths).
   */
  async shot(slug: string, opts: { narrow?: boolean } = {}): Promise<void> {
    this.counter += 1;
    const n = String(this.counter).padStart(3, "0");
    await this.settle();
    await this.page.screenshot({ path: path.join(SCREENSHOT_DIR, `${n}-${slug}-laptop.png`) });
    if (opts.narrow) {
      // Narrow keeps the phase height (so the flow stays legible) at the narrow
      // width, isolating the responsive-width change.
      await this.page.setViewportSize({ width: NARROW_WIDTH, height: this.laptopHeight });
      await this.settle();
      await this.page.screenshot({ path: path.join(SCREENSHOT_DIR, `${n}-${slug}-narrow.png`) });
      await this.page.setViewportSize({ width: LAPTOP_WIDTH, height: this.laptopHeight });
      await this.settle();
    }
  }

  /** Small deterministic settle so layout/fonts/animation reach a stable frame. */
  private async settle(): Promise<void> {
    await this.page.evaluate(() => (document as Document).fonts?.ready).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  // --- Navigation -----------------------------------------------------------

  /** Boot the app at the dashboard (also lets the shorthand dictionary seed). */
  async boot(): Promise<void> {
    await this.page.goto("/");
    await expect(this.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    // Give the ShorthandProvider a beat to seed its default dictionary so the
    // expansion step is deterministic.
    await this.page.waitForTimeout(1200);
  }

  /** Create a fresh round and land in its flow sheet (create-and-redirect). */
  async newRound(): Promise<void> {
    await this.page.goto("/#/rounds/new");
    await this.page.getByRole("form", { name: "Add speech column" }).waitFor();
    await expect(this.page.getByRole("heading", { name: "Round 1" })).toBeVisible();
  }

  // --- Columns --------------------------------------------------------------

  /** Add a speech column through the real add form (Enter submits). */
  async addColumn(label: string, side: "aff" | "neg"): Promise<void> {
    const form = this.page.getByRole("form", { name: "Add speech column" });
    const sideLabel = side === "aff" ? "Aff" : "Neg";
    await form.getByRole("button", { name: sideLabel, exact: true }).click();
    const input = this.page.getByRole("textbox", { name: "New column label" });
    await input.fill(label);
    await input.press("Enter");
  }

  private columns(): Locator {
    return this.page.locator("[data-testid=speech-column]");
  }

  /**
   * Make a column active (routes the C# trigger). The node sits under the
   * react-flow pane, so we dispatch a bubbling click; then we click the heading
   * to drop focus off any editor/input so the document-wide trigger will act.
   */
  private async activateColumn(index: number): Promise<void> {
    await this.columns().nth(index).dispatchEvent("click");
    await this.page.locator("h2").first().click();
    await this.page.waitForTimeout(120);
  }

  // --- Contentions & argument rows -----------------------------------------

  private contentionIds(): Promise<string[]> {
    return this.page.$$eval("[data-testid=contention-node]", (els) =>
      els.map((e) => e.getAttribute("data-flow-node-id") ?? ""),
    );
  }

  private subpointIds(): Promise<string[]> {
    // SubpointNode always renders `data-flow-node-id` (= the subpoint id); there
    // is no `data-subpoint-id` in the app source, so read only the real
    // attribute rather than a fallback that would inject empty-string ids.
    return this.page.$$eval("[data-testid=subpoint-node]", (els) =>
      els.map((e) => e.getAttribute("data-flow-node-id") ?? ""),
    );
  }

  /**
   * The single id in `after` that was not in `before`, or a loud error. Used
   * after a create-trigger so a race (the count check passed but the id read
   * saw a stale set) fails at the source with a clear message instead of
   * silently returning `undefined` typed as `string` into a later selector.
   */
  private newId(before: readonly string[], after: readonly string[], what: string): string {
    const created = after.find((id) => !before.includes(id));
    if (!created) {
      throw new Error(`no new ${what} appeared after the trigger (before=${before.length}, after=${after.length})`);
    }
    return created;
  }

  /** The argument-text editor for a given contention. */
  contentionBody(nodeId: string): Locator {
    return this.page
      .locator(`[data-flow-node-id="${nodeId}"] [data-testid=contention-body] .ProseMirror`)
      .first();
  }

  /**
   * Activate a column and drop a contention into it via the C# trigger,
   * returning the new node's flow id. Public so a caller can drive custom
   * typing (e.g. the shorthand before/after demonstration).
   */
  async dropContention(colIndex: number): Promise<string> {
    await this.activateColumn(colIndex);
    const before = await this.contentionIds();
    await this.page.keyboard.type("C1");
    await this.page.keyboard.press("Enter");
    await this.page.waitForFunction(
      (n) => document.querySelectorAll("[data-testid=contention-node]").length === n + 1,
      before.length,
    );
    const after = await this.contentionIds();
    return this.newId(before, after, "contention node");
  }

  /**
   * Focus a Tiptap editor and wait until it is really ready for input. Polling
   * the `.ProseMirror` focus class alone is not enough - the first keystrokes
   * are dropped for a beat after focus lands - so we also settle briefly, which
   * makes typed content land in full (no eaten leading words).
   */
  async focusEditor(editor: Locator): Promise<void> {
    await editor.click();
    await expect
      .poll(() => this.page.evaluate(() => document.activeElement?.classList.contains("ProseMirror") ?? false))
      .toBeTruthy();
    await this.page.waitForTimeout(160);
  }

  /**
   * Flow one contention into a column: drop the contention with the C# trigger,
   * then type its argument rows (Enter → new row, Shift+Enter → grouped
   * response) and any subpoints (S# trigger).
   */
  async flowContention(colIndex: number, contention: ContentionSeed): Promise<string> {
    const nodeId = await this.dropContention(colIndex);
    const body = this.contentionBody(nodeId);
    await this.focusEditor(body);

    for (let r = 0; r < contention.rows.length; r += 1) {
      const row = contention.rows[r];
      if (r > 0) await this.page.keyboard.press("Enter"); // new argument row
      await this.page.keyboard.type(row.lead);
      for (const resp of row.responses) {
        await this.page.keyboard.press("Shift+Enter"); // grouped response
        await this.page.keyboard.type(resp);
      }
      const subpoints = row.subpoints ?? [];
      for (const sub of subpoints) {
        await this.dropSubpoint(sub, body);
      }
      // dropSubpoint leaves focus in the subpoint's editor; if more rows follow,
      // return focus to the contention body so the next row's Enter/typing goes
      // to the contention, not the just-created subpoint.
      if (subpoints.length > 0 && r < contention.rows.length - 1) {
        await this.focusEditor(body);
      }
    }
    return nodeId;
  }

  /** Drop a subpoint via the S# trigger from inside the contention editor. */
  private async dropSubpoint(text: string, contentionBody: Locator): Promise<void> {
    await this.focusEditor(contentionBody);
    const before = await this.subpointIds();
    await this.page.keyboard.type("S1");
    await this.page.keyboard.press("Enter");
    await this.page.waitForFunction(
      (n) => document.querySelectorAll("[data-testid=subpoint-node]").length === n + 1,
      before.length,
    );
    const after = await this.subpointIds();
    const subId = this.newId(before, after, "subpoint node");
    const subBody = this.page
      .locator(`[data-testid=subpoint-node][data-flow-node-id="${subId}"] .ProseMirror`)
      .first();
    await this.focusEditor(subBody);
    await this.page.keyboard.type(text);
  }

  // --- Block-file card ------------------------------------------------------

  /**
   * Fill one region of a block-file card by placing the caret in it and typing.
   * The card's four regions carry `data-card-region="tag|tagline|cite|body"`,
   * but an EMPTY region collapses to zero width (and the caret cannot be moved
   * between regions by keyboard), so a normal `.click()` is not actionable.
   * Instead we click at explicit coordinates - the card's left edge at the
   * region's vertical centre - which ProseMirror maps to the nearest caret
   * position inside that region. Then we settle (the same first-keystroke race
   * as the flow editors) so the text lands in full.
   */
  async fillCardRegion(card: Locator, region: string, text: string): Promise<void> {
    const cardBox = await card.boundingBox();
    const target = card.locator(`[data-card-region="${region}"]`);
    const box = await target.boundingBox();
    if (!cardBox || !box) throw new Error(`card region "${region}" has no box`);
    await this.page.mouse.click(cardBox.x + 12, box.y + box.height / 2);
    await this.page.waitForTimeout(140);
    await this.page.keyboard.type(text);
  }

  // --- Collapse -------------------------------------------------------------

  /** Collapse a contention to its bar by clicking its header. */
  async collapseContention(nodeId: string): Promise<void> {
    await this.page.locator(`[data-flow-node-id="${nodeId}"] [data-testid=contention-header]`).click();
    await expect(
      this.page.locator(`[data-testid=contention-node][data-flow-node-id="${nodeId}"][data-collapsed="true"]`),
    ).toBeVisible();
  }

  /** Click the toolbar "Collapse all except active" control. */
  async collapseAllExceptActive(): Promise<void> {
    await this.page.getByTestId("collapse-all-except-active").click();
    await this.page.waitForTimeout(200);
  }

  /** Expand a collapsed contention by clicking its header bar. */
  async expandContention(nodeId: string): Promise<void> {
    await this.page.locator(`[data-flow-node-id="${nodeId}"] [data-testid=contention-header]`).click();
    await this.page.waitForTimeout(200);
  }

  // --- Drag: cross-apply + strike -------------------------------------------

  /** Bounding box of a contention's XYFlow node wrapper. */
  private async nodeBox(nodeId: string) {
    const node = this.page.locator(`.react-flow__node:has([data-flow-node-id="${nodeId}"])`).first();
    const box = await node.boundingBox();
    if (!box) throw new Error(`no bounding box for node ${nodeId}`);
    return box;
  }

  /**
   * Drag the source contention onto the target contention's slot. Landing on
   * (adjacent to) the target both cross-applies (copy + transparent arrow) and
   * strikes the target - the clash gesture. Uses a stepped real-mouse traversal
   * because XYFlow's drag is d3-drag (mouse events, not pointer events).
   */
  async dragCrossApply(sourceId: string, targetId: string): Promise<void> {
    const src = await this.nodeBox(sourceId);
    const dst = await this.nodeBox(targetId);
    const sx = src.x + 40;
    const sy = src.y + 12;
    const tx = dst.x + dst.width / 2;
    const ty = dst.y + 20;
    await this.page.mouse.move(sx, sy);
    await this.page.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
      await this.page.mouse.move(sx + ((tx - sx) * i) / 12, sy + ((ty - sy) * i) / 12, { steps: 2 });
      await this.page.waitForTimeout(20);
    }
    await this.page.mouse.up();
    await this.page.waitForTimeout(600);
  }

  // --- Shift+Click selection + send-to-speech -------------------------------

  /** Shift+Click a contention to toggle it into the send selection. */
  async shiftSelectContention(nodeId: string): Promise<void> {
    // The handler is onMouseDownCapture checking shiftKey; dispatch a bubbling
    // mousedown with the modifier so it reaches React's capture listener.
    await this.page.dispatchEvent(
      `[data-flow-node-id="${nodeId}"][data-testid=contention-node]`,
      "mousedown",
      { shiftKey: true, bubbles: true },
    );
    await this.page.waitForTimeout(120);
  }

  /** Fire the global Ctrl/Cmd+Enter send-to-speech chord. */
  async sendToSpeechChord(): Promise<void> {
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await this.page.keyboard.press(`${mod}+Enter`);
    await this.page.waitForTimeout(400);
  }
}
