import { test, expect } from "@playwright/test";
import {
  NarrowRoundHarness,
  NARROW_PRIMARY_WIDTH,
  NARROW_PRIMARY_HEIGHT,
  NARROW_FLOW_HEIGHT,
} from "./narrow-harness";
import { SPEECHES, RESOLUTION, PREP_TIME, RFD_TEXT, BLOCK_CARD } from "./seed";

/**
 * NARROW-VIEWPORT variant of the round-driver journey (Wave 3, long workflow).
 *
 * Plays the identical complete debate round the shared harness plays, but every
 * interaction is performed and captured at NARROW width (1024 primary, with
 * 1280 spot-checks and true-768-height flow captures). The screenshots are the
 * product; assertions fail loudly if the round cannot proceed at narrow width.
 *
 * A running tally of horizontal-overflow deltas is printed at the end - the page
 * body must never scroll horizontally at any state, the hard narrow rule.
 */
test("drives a full debate round at narrow width", async ({ page }) => {
  NarrowRoundHarness.prepareNarrowDir();
  await page.setViewportSize({ width: NARROW_PRIMARY_WIDTH, height: NARROW_PRIMARY_HEIGHT });
  await page.addInitScript(() => {
    const css =
      "*, *::before, *::after { caret-color: transparent !important;" +
      " animation: none !important; transition: none !important;" +
      " scroll-behavior: auto !important; }";
    const apply = () => {
      const s = document.createElement("style");
      s.textContent = css;
      document.head.appendChild(s);
    };
    if (document.head) apply();
    else document.addEventListener("DOMContentLoaded", apply);
  });
  const h = new NarrowRoundHarness(page);
  const overflow: Array<{ state: string; px: number }> = [];
  const track = async (state: string) => {
    const px = await h.horizontalOverflow();
    overflow.push({ state, px });
  };

  // --- 1. Boot + round setup -----------------------------------------------
  await h.boot();
  await h.shot("dashboard", { spot: true });
  await track("dashboard");

  await h.newRound();
  await h.setPhaseHeight(NARROW_FLOW_HEIGHT);
  await h.shot("round-created", { spot: true, short: true });
  await track("round-created");

  for (const speech of SPEECHES) {
    await h.addColumn(speech.label, speech.side);
  }
  await expect(page.locator("[data-testid=speech-column]")).toHaveCount(SPEECHES.length);
  await h.shot("columns-added", { spot: true, short: true });
  await track("columns-added");

  // The floating timer (expanded) pins to the top-right and covers the first
  // contention of the rightmost columns - unreachable beneath it. Collapse it
  // to its compact bar so the whole flow is reachable while flowing; capture the
  // reclaimed space. (Expanded again for the timer-interaction phase below.)
  await page.getByRole("button", { name: "Collapse timers" }).click();
  await expect(page.locator('[aria-label="Timers"][data-collapsed="true"]')).toBeVisible();
  await h.shot("timers-collapsed", { short: true });
  await track("timers-collapsed");

  // --- 2. Flow the 1AC ------------------------------------------------------
  const firstContentionId = await h.flowContention(0, SPEECHES[0].contentions[0]);
  await h.flowContention(0, SPEECHES[0].contentions[1]);
  await h.shot("1ac-flowed", { short: true });
  await track("1ac-flowed");

  // --- 3. Collapse / expand ------------------------------------------------
  await h.collapseAllExceptActive();
  await expect(
    page.locator(`[data-testid=contention-node][data-flow-node-id="${firstContentionId}"][data-collapsed="true"]`),
  ).toBeVisible();
  await h.shot("1ac-collapsed-except-active");
  await track("1ac-collapsed");
  await h.expandContention(firstContentionId);
  await expect(
    page.locator(`[data-testid=contention-node][data-flow-node-id="${firstContentionId}"]:not([data-collapsed])`),
  ).toBeVisible();
  await h.shot("1ac-expanded-again");
  await track("1ac-expanded");

  // --- 4. Flow the 1NC ------------------------------------------------------
  const negContentionId = await h.flowContention(1, SPEECHES[1].contentions[0]);
  await h.shot("1nc-flowed", { short: true });
  await track("1nc-flowed");

  // --- 5. Cross-application drag + adjacent strike -------------------------
  await h.shot("before-cross-apply");
  const contentionsBefore = await page.locator("[data-testid=contention-node]").count();
  await h.dragCrossApply(firstContentionId, negContentionId);
  await expect(page.locator("[data-testid=contention-node]")).toHaveCount(contentionsBefore + 1);
  await expect(page.locator('[data-testid=contention-node][data-struck="true"]')).toHaveCount(1);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await h.shot("after-cross-apply-and-strike", { short: true });
  await track("after-cross-apply-and-strike");

  // --- 6. Shorthand expansion ----------------------------------------------
  const arNodeId = await h.dropContention(2);
  const arBody = h.contentionBody(arNodeId);
  await h.focusEditor(arBody);
  const arRow0 = SPEECHES[2].contentions[0].rows[0];
  await page.keyboard.type(arRow0.lead);
  await expect(arBody).toContainText("aff");
  await h.shot("shorthand-before-expand");
  await track("shorthand-before-expand");
  await page.keyboard.press("Enter");
  await expect(arBody).toContainText("affirmative");
  await h.shot("shorthand-after-expand", { short: true });
  await track("shorthand-after-expand");

  await page.keyboard.type(SPEECHES[2].contentions[0].rows[1].lead);
  await h.flowContention(3, SPEECHES[3].contentions[0]);
  await h.shot("2nr-flowed");
  await track("2nr-flowed");
  await h.flowContention(4, SPEECHES[4].contentions[0]);
  await h.shot("2ar-flowed", { short: true });
  await track("2ar-flowed");

  // --- 7. Timer widget ------------------------------------------------------
  // Re-expand the timer to interact with it.
  await page.getByRole("button", { name: "Expand timers" }).click();
  await expect(page.getByRole("button", { name: "Aff prep time", exact: true })).toBeVisible();
  const prepValue = page.getByRole("button", { name: "Aff prep time", exact: true });
  await prepValue.click();
  const prepInput = page.getByRole("textbox", { name: "Aff prep time", exact: true });
  await prepInput.fill(PREP_TIME);
  await prepInput.press("Enter");
  await expect(prepValue).toHaveText(PREP_TIME);
  await h.shot("timer-prep-edited", { short: true });
  await track("timer-prep-edited");
  await page.getByRole("button", { name: "Play Aff prep timer" }).click();
  await expect(page.getByRole("button", { name: "Pause Aff prep timer" })).toBeVisible();
  await page.getByRole("button", { name: "Pause Aff prep timer" }).click();
  await page.getByRole("button", { name: "Reset Aff prep timer" }).click();
  await page.getByRole("button", { name: "Advance to next speech" }).click();
  // #100: RoundScreen passes live column labels, so the selector uses "1NC"
  // (the column label), not the generic fallback "NC".
  await expect(page.getByRole("button", { name: "1NC", exact: true })).toHaveAttribute("aria-pressed", "true");
  await h.shot("timer-speech-selector-nc");
  await track("timer-speech-selector-nc");

  // --- 8. Dock a speech doc, Send Flow -------------------------------------
  const roundUrl = page.url();
  await page.goto("/#/speeches/new");
  await expect(page.getByRole("heading", { name: "Speech 1" })).toBeVisible();
  await page.waitForTimeout(400);
  await page.goto(roundUrl);
  await page.getByRole("form", { name: "Add speech column" }).waitFor();

  // At narrow width the dock starts collapsed (flow gets full width); a debater
  // opens it deliberately. Capture that collapsed default, then open it.
  await h.shot("dock-collapsed-default", { short: true });
  await track("dock-collapsed-default");
  const openDock = page.getByRole("button", { name: "Open speech dock" });
  if (await openDock.isVisible().catch(() => false)) {
    await openDock.click();
  }

  const dockSelect = page.getByRole("combobox", { name: "Active speech doc" });
  await dockSelect.selectOption({ label: "Speech 1" });
  await expect(page.getByTestId("active-speech-doc-indicator")).toContainText("Speech 1");
  // Returning to the round remounted the flow, so the timer reset to expanded.
  // On a narrow screen with the dock open there is no room for it, so collapse
  // it - the representative narrow docked state.
  await page.getByRole("button", { name: "Collapse timers" }).click();
  await expect(page.locator('[aria-label="Timers"][data-collapsed="true"]')).toBeVisible();
  await h.shot("speech-dock-side", { spot: true, short: true });
  await track("speech-dock-side");

  const dockGroup = page.getByRole("group", { name: "Dock position" });
  await dockGroup.getByRole("button", { name: "Bottom" }).click();
  await h.shot("speech-dock-bottom", { spot: true, short: true });
  await track("speech-dock-bottom");
  await dockGroup.getByRole("button", { name: "Side" }).click();

  await h.shiftSelectContention(firstContentionId);
  await h.shiftSelectContention(arNodeId);
  await expect(page.locator("[data-testid=contention-node][data-selected]")).toHaveCount(2);
  await h.shot("send-flow-selected");
  await track("send-flow-selected");
  await h.shiftSelectContention(arNodeId);
  await expect(page.locator("[data-testid=contention-node][data-selected]")).toHaveCount(1);
  await h.sendToSpeechChord();
  await h.shiftSelectContention(arNodeId);
  await h.sendToSpeechChord();
  await expect(page.getByTestId("speech-dock").getByText(/affirmative case controls/i).first()).toBeVisible();
  await h.shot("send-flow-sent", { short: true });
  await track("send-flow-sent");

  // --- 9. RFD ---------------------------------------------------------------
  const rfd = page.getByTestId("rfd-section").locator(".ProseMirror").first();
  await h.focusEditor(rfd);
  await page.keyboard.type(`${RESOLUTION}\n\n${RFD_TEXT}`);
  await expect(rfd).toContainText("Voting aff");
  await h.shot("rfd-written", { short: true });
  await track("rfd-written");

  // --- 10. Block file + ToC bulk-send --------------------------------------
  await h.setPhaseHeight(NARROW_PRIMARY_HEIGHT);
  await page.goto("/#/blocks");
  const blockEditor = page.locator(".block-file-editor .ProseMirror").first();
  await blockEditor.waitFor();
  await h.focusEditor(blockEditor);
  await page.keyboard.press("Home");
  await page.keyboard.type("# Freight and logistics");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /New card/i }).click();
  await page.waitForTimeout(300);
  await page.keyboard.type(BLOCK_CARD.tag);
  const card = page.locator("[data-card]").first();
  await expect(page.locator("[data-card]")).toHaveCount(1);
  await h.fillCardRegion(card, "tagline", BLOCK_CARD.tagline);
  await h.fillCardRegion(card, "cite", BLOCK_CARD.cite);
  await h.fillCardRegion(card, "body", BLOCK_CARD.body);
  const cardBody = card.locator('[data-card-region="body"]');
  await cardBody.selectText();
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect(cardBody.locator("mark")).toHaveCount(1);
  await h.shot("blockfile-card", { spot: true, short: true });
  await track("blockfile-card");

  // The block-file screen docks the speech editor too; at narrow width it also
  // starts collapsed, so open it before choosing the active speech.
  const openBlockDock = page.getByRole("button", { name: "Open speech dock" });
  if (await openBlockDock.isVisible().catch(() => false)) {
    await openBlockDock.click();
  }
  const blockDockSelect = page.getByRole("combobox", { name: "Active speech doc" });
  await blockDockSelect.selectOption({ label: "Speech 1" });
  const includeBox = page.getByRole("checkbox", { name: /Include .* in speech/i }).first();
  await includeBox.check();
  await h.shot("blockfile-toc-checked");
  await track("blockfile-toc-checked");
  await page.getByRole("button", { name: /Send to Speech Doc/i }).click();
  await page.waitForTimeout(500);
  await h.shot("blockfile-toc-sent", { short: true });
  await track("blockfile-toc-sent");

  // --- 11. Export flow ------------------------------------------------------
  await page.goto("/#/speeches");
  await page.getByRole("link", { name: /Speech 1/ }).first().click();
  await expect(page.getByRole("heading", { name: "Speech 1" })).toBeVisible();
  const exportBtn = page.getByRole("button", { name: "Export to Email" });
  await expect(exportBtn).toBeVisible();
  await expect(exportBtn).toBeEnabled();
  await h.shot("speech-doc-export-ready", { spot: true, short: true });
  await track("speech-doc-export-ready");
  await exportBtn.click();
  await expect(page.getByRole("status")).not.toBeEmpty();
  await h.shot("speech-doc-export-invoked", { short: true });
  await track("speech-doc-export-invoked");

  // --- Horizontal-overflow report ------------------------------------------
  const offenders = overflow.filter((o) => o.px > 0);
  console.log("NARROW horizontal-overflow tally (px past clientWidth at 1024):");
  for (const o of overflow) console.log(`  ${o.px > 0 ? "OVERFLOW" : "ok      "} ${String(o.px).padStart(4)}  ${o.state}`);
  if (offenders.length > 0) {
    console.log(`\n${offenders.length} state(s) with horizontal overflow at 1024 width.`);
  } else {
    console.log("\nNo horizontal overflow at any state. ✓");
  }
  expect(offenders, JSON.stringify(offenders)).toHaveLength(0);
});
