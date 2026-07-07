import { test, expect } from "@playwright/test";
import { RoundHarness, LAPTOP_WIDTH, STANDARD_HEIGHT, FLOW_HEIGHT } from "./harness";
import {
  SPEECHES,
  RESOLUTION,
  SHORTHAND_LINE,
  PREP_TIME,
  RFD_TEXT,
  BLOCK_CARD,
} from "./seed";

/**
 * The round-driver harness: one long, ordered journey that plays a COMPLETE
 * debate round through Fulcrum's real UI and captures a chronological
 * screenshot sequence. It is the project's visual-regression backbone.
 *
 * The screenshots are the product; the assertions exist so the run fails loudly
 * if the round cannot actually proceed (a column never appears, a contention
 * never drops, the cross-apply copy never lands, ...). A fresh browser context
 * (empty IndexedDB) plus fixed seed data make two runs walk the identical
 * sequence.
 */
test("drives a full debate round through the real UI", async ({ page }) => {
  RoundHarness.prepareScreenshotDir();
  await page.setViewportSize({ width: LAPTOP_WIDTH, height: STANDARD_HEIGHT });
  // Determinism: kill the blinking text caret and all animation/transition so
  // two runs produce byte-identical captures of the same state. Runs on every
  // navigation (init scripts re-run per load).
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
  const h = new RoundHarness(page);

  // --- 1. Boot + round setup -----------------------------------------------
  await h.boot();
  await h.shot("dashboard");

  await h.newRound();
  // The flow sheet is a tall surface - raise the laptop height for the round
  // phase so every contention stays on-canvas (see FLOW_HEIGHT).
  await h.setPhaseHeight(FLOW_HEIGHT);
  await h.shot("round-created", { narrow: true });

  // Build the speech columns (the flow sheet's speeches).
  for (const speech of SPEECHES) {
    await h.addColumn(speech.label, speech.side);
  }
  await expect(page.locator("[data-testid=speech-column]")).toHaveCount(SPEECHES.length);
  await h.shot("columns-added", { narrow: true });

  // --- 2. Flow the 1AC (contentions, responses, a subpoint) ----------------
  const firstContentionId = await h.flowContention(0, SPEECHES[0].contentions[0]);
  await h.flowContention(0, SPEECHES[0].contentions[1]);
  await h.shot("1ac-flowed", { narrow: true });

  // --- 3. Collapse / expand ------------------------------------------------
  // After flowing, the active node is the second contention (last focused), so
  // "Collapse all except active" collapses the FIRST contention to its bar and
  // leaves the second expanded. (We deliberately keep the first contention out
  // of the header-toggle path so it stays draggable for the cross-apply below.)
  await h.collapseAllExceptActive();
  await expect(
    page.locator(`[data-testid=contention-node][data-flow-node-id="${firstContentionId}"][data-collapsed="true"]`),
  ).toBeVisible();
  await h.shot("1ac-collapsed-except-active");
  // Expand the first contention again by clicking its collapsed bar header.
  await h.expandContention(firstContentionId);
  await expect(
    page.locator(`[data-testid=contention-node][data-flow-node-id="${firstContentionId}"]:not([data-collapsed])`),
  ).toBeVisible();
  await h.shot("1ac-expanded-again");

  // --- 4. Flow the 1NC (the neg's answers, into column 1) ------------------
  const negContentionId = await h.flowContention(1, SPEECHES[1].contentions[0]);
  await h.shot("1nc-flowed", { narrow: true });

  // --- 5. Cross-application drag (copy + arrow) + adjacent strike -----------
  await h.shot("before-cross-apply");
  const contentionsBefore = await page.locator("[data-testid=contention-node]").count();
  // Drag the aff C1 onto the neg C1's slot: cross-applies a copy into the neg
  // column (transparent arrow original→copy) AND strikes the neg argument.
  await h.dragCrossApply(firstContentionId, negContentionId);
  await expect(page.locator("[data-testid=contention-node]")).toHaveCount(contentionsBefore + 1);
  await expect(page.locator('[data-testid=contention-node][data-struck="true"]')).toHaveCount(1);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await h.shot("after-cross-apply-and-strike", { narrow: true });

  // --- 6. Shorthand: type an abbreviation, transition, watch it expand ------
  // Flow the 1AR's first contention by hand so we can screenshot before/after
  // the expansion. `aff` is a seeded default abbreviation → `affirmative`.
  const arNodeId = await h.dropContention(2);
  const arBody = h.contentionBody(arNodeId);
  await h.focusEditor(arBody);
  await page.keyboard.type(SHORTHAND_LINE.typed);
  await expect(arBody).toContainText(SHORTHAND_LINE.abbreviation);
  await h.shot("shorthand-before-expand");
  await page.keyboard.press("Enter"); // the row transition runs the expansion
  await expect(arBody).toContainText(SHORTHAND_LINE.expansion);
  await h.shot("shorthand-after-expand", { narrow: true });

  // Finish the rest of the 1AR / 2NR / 2AR so the flow reads as a full round.
  await page.keyboard.type(SPEECHES[2].contentions[0].rows[1].lead);
  await h.flowContention(3, SPEECHES[3].contentions[0]);
  await h.shot("2nr-flowed");
  await h.flowContention(4, SPEECHES[4].contentions[0]);
  await h.shot("2ar-flowed", { narrow: true });

  // --- 7. Timer widget: edit prep, start/pause, cycle the speech selector ---
  const prepValue = page.getByRole("button", { name: "Aff prep time", exact: true });
  await prepValue.click();
  const prepInput = page.getByRole("textbox", { name: "Aff prep time", exact: true });
  await prepInput.fill(PREP_TIME);
  await prepInput.press("Enter");
  await expect(prepValue).toHaveText(PREP_TIME);
  await h.shot("timer-prep-edited");
  // Start then immediately pause (we never screenshot a running clock - it would
  // break run-to-run determinism).
  await page.getByRole("button", { name: "Play Aff prep timer" }).click();
  await expect(page.getByRole("button", { name: "Pause Aff prep timer" })).toBeVisible();
  await page.getByRole("button", { name: "Pause Aff prep timer" }).click();
  await page.getByRole("button", { name: "Reset Aff prep timer" }).click();
  // Cycle the speech selector AC → NC (deterministic label).
  await page.getByRole("button", { name: "Advance to next speech" }).click();
  await expect(page.getByRole("button", { name: "NC", exact: true })).toHaveAttribute("aria-pressed", "true");
  await h.shot("timer-speech-selector-nc");

  // --- 8. Create + dock a speech doc, then Send Flow into it ----------------
  const roundUrl = page.url();
  await page.goto("/#/speeches/new");
  await expect(page.getByRole("heading", { name: "Speech 1" })).toBeVisible();
  await page.waitForTimeout(400);
  await page.goto(roundUrl);
  await page.getByRole("form", { name: "Add speech column" }).waitFor();

  // The dock is open by default; pick our speech as the active doc.
  const dockSelect = page.getByRole("combobox", { name: "Active speech doc" });
  await dockSelect.selectOption({ label: "Speech 1" });
  await expect(page.getByTestId("active-speech-doc-indicator")).toContainText("Speech 1");
  await h.shot("speech-dock-side", { narrow: true });

  // Dock to the bottom edge, then back to the side.
  const dockGroup = page.getByRole("group", { name: "Dock position" });
  await dockGroup.getByRole("button", { name: "Bottom" }).click();
  await h.shot("speech-dock-bottom", { narrow: true });
  await dockGroup.getByRole("button", { name: "Side" }).click();

  // Send Flow: Shift+Click multi-select two contentions to show the gesture and
  // the selection rings.
  await h.shiftSelectContention(firstContentionId);
  await h.shiftSelectContention(arNodeId);
  await expect(page.locator("[data-testid=contention-node][data-selected]")).toHaveCount(2);
  await h.shot("send-flow-selected");
  // Send with the Ctrl/Cmd+Enter chord. NOTE: the append orders by the flow's
  // `nodes` Y.Map iteration, whose order depends on the run's random Yjs
  // clientID - so a *multi-node* send's paragraph order is not stable run to
  // run. To keep the harness deterministic we deselect one, send the first,
  // then select and send the second: the accumulation order is then the (fixed)
  // send order. Each gesture is still a real Shift+Click select + chord.
  await h.shiftSelectContention(arNodeId); // deselect → only the 1AC contention
  await expect(page.locator("[data-testid=contention-node][data-selected]")).toHaveCount(1);
  await h.sendToSpeechChord(); // appends the 1AC argument, clears the selection
  await h.shiftSelectContention(arNodeId); // now select the 1AR contention
  await h.sendToSpeechChord(); // appends the 1AR argument
  await expect(page.getByTestId("speech-dock").getByText(/affirmative case controls/i).first()).toBeVisible();
  await h.shot("send-flow-sent", { narrow: true });

  // --- 9. Write the RFD ----------------------------------------------------
  const rfd = page.getByTestId("rfd-section").locator(".ProseMirror").first();
  await h.focusEditor(rfd);
  await page.keyboard.type(`${RESOLUTION}\n\n${RFD_TEXT}`);
  await expect(rfd).toContainText("Voting aff");
  await h.shot("rfd-written", { narrow: true });

  // --- 10. Block file: seed a card, ToC bulk-send into the speech doc -------
  await h.setPhaseHeight(STANDARD_HEIGHT); // back to the standard laptop height
  await page.goto("/#/blocks");
  await page.waitForTimeout(800);
  // A heading defines an argument section the ToC can send.
  const blockEditor = page.locator(".block-file-editor .ProseMirror, .ProseMirror").first();
  await blockEditor.click();
  await page.keyboard.press("Home");
  await page.keyboard.type("# Freight and logistics");
  await page.keyboard.press("Enter");
  // Quick-create a card under that section and fill its regions.
  await page.getByRole("button", { name: /New card/i }).click();
  await page.waitForTimeout(300);
  await page.keyboard.type(BLOCK_CARD.tag);
  await expect(page.locator("[data-card]")).toHaveCount(1);
  await h.shot("blockfile-card", { narrow: true });

  // Make our speech the active doc in the block-file dock, tick the section,
  // and bulk-send.
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
  await h.shot("speech-doc-export-ready", { narrow: true });
  // Exercise the export action: the Email target assembles the payload and hands
  // a mailto: to the OS opener. Under the headless dev server there is no Tauri
  // bridge, so this stops short of launching a mail app and surfaces a status
  // line instead - exactly the "open the flow, don't launch externals" boundary.
  await exportBtn.click();
  await expect(page.getByRole("status")).not.toBeEmpty();
  await h.shot("speech-doc-export-invoked", { narrow: true });
});
