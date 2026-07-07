import { test, expect } from "@playwright/test";
import { LAPTOP_WIDTH, STANDARD_HEIGHT, FLOW_HEIGHT } from "./harness";
import { PfRoundHarness } from "./harness-pf";
import {
  SPEECHES,
  RESOLUTION,
  PREP_TIME,
  RFD_TEXT,
  BLOCK_CARD,
} from "./seed-pf";

/**
 * PUBLIC-FORUM variant of the round-driver harness (v1-speech-order tester).
 *
 * Plays a COMPLETE debate round that differs *structurally* from the standard
 * Policy/LD harness round: it is flowed NEG-FIRST (the Con team opens), the
 * columns carry Public-Forum speech labels (`Con Case`, `Pro Case`, ...) instead
 * of `1AC`/`1NC`, and there are six speeches. The goal is to prove the app
 * handles a non-default round structure gracefully - column headers, the timer
 * speech selector/labels, and speech-doc naming.
 *
 * As with the standard spec, the screenshots are the product; the assertions
 * exist so the run fails loudly if the round cannot actually proceed.
 */
test("drives a NEG-first Public-Forum round through the real UI", async ({ page }) => {
  PfRoundHarness.preparePfScreenshotDir();
  await page.setViewportSize({ width: LAPTOP_WIDTH, height: STANDARD_HEIGHT });
  // Determinism: kill the blinking caret and all animation/transition.
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
  const h = new PfRoundHarness(page);

  // --- 1. Boot + round setup -----------------------------------------------
  await h.boot();
  await h.shot("dashboard");

  await h.newRound();
  await h.setPhaseHeight(FLOW_HEIGHT);
  await h.shot("round-created", { narrow: true });

  // Build the PF speech columns - Con (neg) FIRST, the structural inversion.
  for (const speech of SPEECHES) {
    await h.addColumn(speech.label, speech.side);
  }
  await expect(page.locator("[data-testid=speech-column]")).toHaveCount(SPEECHES.length);
  await h.shot("columns-added", { narrow: true });

  // The speech dock ships OPEN by default, squeezing the flow to ~58% and
  // pushing the later columns off-canvas behind it. A debater flowing a full
  // six-speech round collapses it to reclaim the width; we reopen it for the
  // Send-Flow step. (See the tester report - the open-by-default dock + floating
  // timer obstructing the right-hand columns is a noted layout finding.)
  await h.collapseDock();

  // --- 2. Flow the Con Case FIRST (neg-first) ------------------------------
  const firstContentionId = await h.flowColumnCentered(0, SPEECHES[0].contentions[0]);
  await h.flowContention(0, SPEECHES[0].contentions[1]);
  await h.resetPan();
  await h.shot("con-case-flowed", { narrow: true });

  // --- 3. Collapse / expand ------------------------------------------------
  await h.collapseAllExceptActive();
  await expect(
    page.locator(`[data-testid=contention-node][data-flow-node-id="${firstContentionId}"][data-collapsed="true"]`),
  ).toBeVisible();
  await h.shot("con-case-collapsed-except-active");
  await h.expandContention(firstContentionId);
  await expect(
    page.locator(`[data-testid=contention-node][data-flow-node-id="${firstContentionId}"]:not([data-collapsed])`),
  ).toBeVisible();
  await h.shot("con-case-expanded-again");

  // --- 4. Flow the Pro Case (aff answers, into column 1) -------------------
  const proContentionId = await h.flowColumnCentered(1, SPEECHES[1].contentions[0]);
  await h.resetPan();
  await h.shot("pro-case-flowed", { narrow: true });

  // --- 5. Cross-application drag (copy + arrow) + adjacent strike -----------
  // NEG-FIRST clash: drag the Con Case C1 onto the Pro Case C1's slot -
  // cross-applies a copy of the Con argument into the Pro column (transparent
  // arrow original→copy) AND strikes the Pro argument being answered.
  // Reset the pan so both the source (col 0) and target (col 1) columns are on
  // screen for the mouse-drag traversal.
  await h.resetPan();
  await h.shot("before-cross-apply");
  const contentionsBefore = await page.locator("[data-testid=contention-node]").count();
  await h.dragCrossApply(firstContentionId, proContentionId);
  await expect(page.locator("[data-testid=contention-node]")).toHaveCount(contentionsBefore + 1);
  await expect(page.locator('[data-testid=contention-node][data-struck="true"]')).toHaveCount(1);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await h.shot("after-cross-apply-and-strike", { narrow: true });

  // --- 6. Shorthand: type an abbreviation, transition, watch it expand ------
  // Flow the Con Rebuttal's first contention by hand. The seed lead starts with
  // `neg`, a seeded default abbreviation that expands to `negative` on the row
  // transition.
  await h.centerColumn(2);
  const rebNodeId = await h.dropContention(2);
  const rebBody = h.contentionBody(rebNodeId);
  await h.focusEditor(rebBody);
  const rebRow0 = SPEECHES[2].contentions[0].rows[0];
  await page.keyboard.type(rebRow0.lead);
  await expect(rebBody).toContainText("neg");
  await h.shot("shorthand-before-expand");
  await page.keyboard.press("Enter"); // the row transition runs the expansion
  await expect(rebBody).toContainText("negative");
  await h.shot("shorthand-after-expand", { narrow: true });

  // Finish the rest of the round so the flow reads complete.
  await page.keyboard.type(SPEECHES[2].contentions[0].rows[1].lead);
  await h.flowColumnCentered(3, SPEECHES[3].contentions[0]);
  await h.resetPan();
  await h.shot("pro-rebuttal-flowed");
  await h.flowColumnCentered(4, SPEECHES[4].contentions[0]);
  await h.flowColumnCentered(5, SPEECHES[5].contentions[0]);
  await h.resetPan();
  await h.shot("full-round-flowed", { narrow: true });

  // --- 7. Timer widget: edit NEG prep, start/pause, cycle the speech selector -
  // Neg-first: edit the Con (neg) prep clock. This also stresses the speech
  // selector, whose labels (AC/NC/CX/AR) are Policy/LD-specific - judge whether
  // they read sensibly for a Public-Forum round.
  const prepValue = page.getByRole("button", { name: "Neg prep time", exact: true });
  await prepValue.click();
  const prepInput = page.getByRole("textbox", { name: "Neg prep time", exact: true });
  await prepInput.fill(PREP_TIME);
  await prepInput.press("Enter");
  await expect(prepValue).toHaveText(PREP_TIME);
  await h.shot("timer-prep-edited");
  await page.getByRole("button", { name: "Play Neg prep timer" }).click();
  await expect(page.getByRole("button", { name: "Pause Neg prep timer" })).toBeVisible();
  await page.getByRole("button", { name: "Pause Neg prep timer" }).click();
  await page.getByRole("button", { name: "Reset Neg prep timer" }).click();
  // The speech selector now reflects the ROUND'S actual speeches (this variant's
  // fix): the labels are the PF column names, not the generic AC/NC/CX/AR. The
  // first speech is "Con Case" (neg-first); advancing once selects "Pro Case".
  const speechSelector = page.getByRole("group", { name: "Select speech" });
  await expect(speechSelector.getByRole("button", { name: "Con Case", exact: true })).toBeVisible();
  await expect(speechSelector.getByRole("button", { name: "AC", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Advance to next speech" }).click();
  await expect(speechSelector.getByRole("button", { name: "Pro Case", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await h.shot("timer-speech-selector-pro-case");

  // --- 8. Create + dock a speech doc, then Send Flow into it ----------------
  const roundUrl = page.url();
  await page.goto("/#/speeches/new");
  await expect(page.getByRole("heading", { name: "Speech 1" })).toBeVisible();
  await page.waitForTimeout(400);
  await page.goto(roundUrl);
  await page.getByRole("form", { name: "Add speech column" }).waitFor();
  await h.setPhaseHeight(FLOW_HEIGHT);
  // Reopen the dock (collapsed during flowing) to send the flow into it.
  await h.openDock();
  await h.resetPan();

  const dockSelect = page.getByRole("combobox", { name: "Active speech doc" });
  await dockSelect.selectOption({ label: "Speech 1" });
  await expect(page.getByTestId("active-speech-doc-indicator")).toContainText("Speech 1");
  await h.shot("speech-dock-side", { narrow: true });

  const dockGroup = page.getByRole("group", { name: "Dock position" });
  await dockGroup.getByRole("button", { name: "Bottom" }).click();
  await h.shot("speech-dock-bottom", { narrow: true });
  await dockGroup.getByRole("button", { name: "Side" }).click();

  // Send Flow: Shift+Click multi-select two contentions to show the rings.
  await h.shiftSelectContention(firstContentionId);
  await h.shiftSelectContention(rebNodeId);
  await expect(page.locator("[data-testid=contention-node][data-selected]")).toHaveCount(2);
  await h.shot("send-flow-selected");
  // Deterministic accumulation: deselect one, send the Con Case argument, then
  // select + send the Con Rebuttal argument (see the standard spec's note on
  // Y.Map iteration order).
  await h.shiftSelectContention(rebNodeId); // deselect → only the Con Case contention
  await expect(page.locator("[data-testid=contention-node][data-selected]")).toHaveCount(1);
  await h.sendToSpeechChord();
  await h.shiftSelectContention(rebNodeId); // select the Con Rebuttal contention
  await h.sendToSpeechChord();
  await expect(page.getByTestId("speech-dock").getByText(/negative controls the sovereignty/i).first()).toBeVisible();
  await h.shot("send-flow-sent", { narrow: true });

  // --- 9. Write the RFD ----------------------------------------------------
  const rfd = page.getByTestId("rfd-section").locator(".ProseMirror").first();
  await h.focusEditor(rfd);
  await page.keyboard.type(`${RESOLUTION}\n\n${RFD_TEXT}`);
  await expect(rfd).toContainText("Voting Con");
  await h.shot("rfd-written", { narrow: true });

  // --- 10. Block file: seed a card, ToC bulk-send into the speech doc -------
  await h.setPhaseHeight(STANDARD_HEIGHT);
  await page.goto("/#/blocks");
  const blockEditor = page.locator(".block-file-editor .ProseMirror").first();
  await blockEditor.waitFor();
  await h.focusEditor(blockEditor);
  await page.keyboard.press("Home");
  await page.keyboard.type("# Sovereignty and accountability");
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
  await h.shot("blockfile-card", { narrow: true });

  const blockDockSelect = page.getByRole("combobox", { name: "Active speech doc" });
  await blockDockSelect.selectOption({ label: "Speech 1" });
  const includeBox = page.getByRole("checkbox", { name: /Include .* in speech/i }).first();
  await includeBox.check();
  await h.shot("blockfile-toc-checked");
  await page.getByRole("button", { name: /Send to Speech Doc/i }).click();
  await page.waitForTimeout(500);
  await h.shot("blockfile-toc-sent", { narrow: true });

  // --- 11. Export flow (Email) - open, stop short of launching a mail app ---
  await page.goto("/#/speeches");
  await page.getByRole("link", { name: /Speech 1/ }).first().click();
  await expect(page.getByRole("heading", { name: "Speech 1" })).toBeVisible();
  const exportBtn = page.getByRole("button", { name: "Export to Email" });
  await expect(exportBtn).toBeVisible();
  await expect(exportBtn).toBeEnabled();
  await h.shot("speech-doc-export-ready", { narrow: true });
  await exportBtn.click();
  await expect(page.getByRole("status")).not.toBeEmpty();
  await h.shot("speech-doc-export-invoked", { narrow: true });
});
