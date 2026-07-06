/**
 * The "Send to Block File" card tool's registry definition.
 *
 * Every card-cutting tool registers one {@link CardToolDefinition} so it shares
 * the toolbar's enumeration and the per-tool settings section on the shared
 * preference store. Send's one setting is the **default action** (copy vs move)
 * its destination picker pre-selects.
 *
 * Unlike the in-place tools (Highlight, Shrink, Condense), Send needs an
 * interactive *destination picker* - which the synchronous
 * {@link CardToolDefinition.applyToSelection} seam cannot host - so its real
 * toolbar presence is a custom control ({@link ./SendToBlockFileControl}), wired
 * in {@link ../react/useCardTools}. `applyToSelection` is therefore a deliberate
 * no-op: a plain button-click can never silently misfile a card to an unchosen
 * destination.
 */
import type { PreferenceField } from "../../preferences";
import type { CardToolDefinition } from "../registry";
import type { SendMode } from "./send-to-block-file";

/** The stable registry/id + settings-section id for the Send tool. */
export const SEND_TOOL_ID = "send";

/** The Send tool's settings schema: the default copy/move action. */
export type SendToolSettings = {
  /** The action the destination picker pre-selects. */
  defaultMode: PreferenceField<SendMode>;
};

/**
 * The Send tool definition. Registered for its settings section and toolbar
 * enumeration; its interactive invocation is the custom control, so
 * `applyToSelection` is an intentional no-op (see the module docblock).
 */
export const sendToBlockFileTool: CardToolDefinition<SendToolSettings> = {
  id: SEND_TOOL_ID,
  label: "Send to Block File",
  description:
    "Move or copy the selected card into a chosen argument section of the " +
    "block file.",
  settings: {
    defaultMode: {
      // Widened to `SendMode` so it can be set to either value from Settings.
      default: "copy" as SendMode,
      label: "Default action",
      description: "Whether Send copies (keeps the original) or moves the card.",
      options: ["copy", "move"] as SendMode[],
    },
  },
  applyToSelection(): boolean {
    // Send requires a destination the user chooses in its picker; the plain
    // apply seam has no destination, so it does nothing. The custom toolbar
    // control is the real entry point.
    return false;
  },
};
