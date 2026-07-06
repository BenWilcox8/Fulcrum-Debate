/**
 * The card-cutting tool registration contract - slice 1 of the Card-Cutting
 * Toolbar & Tool Customization Framework.
 *
 * Every card-cutting tool the product ships (Extract, Shrink, Condense, Auto
 * Speech, Send to Block File, ...) is a distinct feature that lands later, but
 * they all share one shape: an id, a display label, an operation that transforms
 * the *active editor selection*, and a bundle of user-customizable settings with
 * declared defaults. This module is that shared shape - the small, stable seam
 * each tool plugs into and the future toolbar UI enumerates. It deliberately
 * ships **no tool and no toolbar UI**; keeping the contract minimal is the point,
 * because it blocks every individual tool.
 *
 * ## Design: one preference section per tool
 *
 * A tool's settings are registered on the shared {@link PreferenceStore}
 * (`src/preferences`) as **its own section**, exactly like the evidence
 * {@link ../formatting/preferences | formatting} feature registers one section.
 * The alternative - a single shared `tools` section keyed by tool - was rejected:
 * the store's reset, subscription, and (future) Settings panel are all
 * *section-scoped*, so a per-tool section gives "reset **this** tool to defaults"
 * and "render **this** tool's settings panel" for free, and keeps one tool's
 * schema change from being a cross-tool concern. The section id is namespaced
 * ({@link toolSectionId}, `tool:<id>`) so a tool id can never collide with a
 * non-tool section such as `formatting`.
 *
 * The registry is pure and free of React: it wires a tool's declared settings to
 * the store and forwards the live snapshot to the tool on invocation. It follows
 * the documented-contract discipline of the {@link ../blockfile/card-unit |
 * card-unit API} and the formatting profile - small functions, clear docblocks,
 * behaviour asserted over public seams.
 */
import type { Editor } from "@tiptap/core";
import type {
  PreferenceStore,
  SectionDefinition,
  SectionHandle,
  SectionSchema,
  SectionValues,
} from "../preferences";

/** Prefix that namespaces every tool's settings section on the store. */
export const TOOL_SECTION_ID_PREFIX = "tool:";

/**
 * The store section id a tool's settings are registered under. Namespacing keeps
 * a tool id (`shrink`, `extract`, ...) from colliding with a non-tool section id
 * (`formatting`, ...) that happens to share the name.
 */
export function toolSectionId(toolId: string): string {
  return `${TOOL_SECTION_ID_PREFIX}${toolId}`;
}

/**
 * A card-cutting tool's registration payload: how it identifies itself, the
 * settings it exposes to the user, and how it transforms the selection.
 *
 * The settings schema `S` is a {@link SectionSchema} - the exact shape a
 * {@link PreferenceStore} section registers - so a tool declares its defaults and
 * render metadata once and gets persistence, reset, and (later) a settings panel
 * from the store. The value type of each key is inferred from its `default`.
 */
export interface CardToolDefinition<S extends SectionSchema = SectionSchema> {
  /** Stable id, unique within the registry (e.g. `"shrink"`). */
  readonly id: string;
  /** Human-facing name for the toolbar button and its settings section. */
  readonly label: string;
  /** Longer description of the tool, surfaced in its settings section. */
  readonly description?: string;
  /** The tool's customizable settings: typed fields with defaults + metadata. */
  readonly settings: S;
  /**
   * Applies the tool to `editor`'s current selection, using its live `settings`
   * snapshot (defaults merged with any persisted overrides - the registry reads
   * it fresh on every invocation). Returns whether it changed the document, the
   * same truthiness a Tiptap command chain returns.
   */
  applyToSelection(editor: Editor, settings: SectionValues<S>): boolean;
}

/**
 * A tool after it is registered: the identity + label the toolbar renders, the
 * persisted {@link SectionHandle settings handle} the settings UI edits and
 * resets, and {@link apply} - the one-call invocation that reads the live
 * settings and runs the tool on the editor selection.
 */
export interface RegisteredCardTool<S extends SectionSchema = SectionSchema> {
  /** The tool's id (matches {@link CardToolDefinition.id}). */
  readonly id: string;
  /** The tool's display label. */
  readonly label: string;
  /**
   * The live handle to the tool's persisted settings section. `getAll()`/`get()`
   * read defaults merged with overrides, `set()` edits one field, and `reset()`
   * restores the declared defaults - all section-scoped to this tool.
   */
  readonly settings: SectionHandle<S>;
  /**
   * Reads the tool's current settings snapshot from the store and applies the
   * tool to `editor`'s selection. This is the seam that guarantees a tool always
   * runs with its live persisted settings, never a stale copy.
   */
  apply(editor: Editor): boolean;
}

/**
 * The card-tool registry: registers tools against a shared preference store and
 * enumerates them for the toolbar UI. Registration order is preserved so the
 * toolbar is stable across reloads.
 */
export interface CardToolRegistry {
  /**
   * Registers a tool: registers its settings as a namespaced section on the
   * store and returns the {@link RegisteredCardTool}.
   *
   * Duplicate ids are **idempotent-or-error**, mirroring the store's own rule:
   * re-registering the same id with the same label and a structurally-identical
   * settings schema returns the existing registered tool (preserving any values
   * already set - safe under StrictMode/hot-reload), while a different label or a
   * different settings schema throws rather than silently clobbering the first
   * tool or its persisted data.
   */
  register<S extends SectionSchema>(
    definition: CardToolDefinition<S>,
  ): RegisteredCardTool<S>;
  /** Returns a registered tool by id, or `undefined`. */
  get<S extends SectionSchema = SectionSchema>(
    id: string,
  ): RegisteredCardTool<S> | undefined;
  /** Lists every registered tool, in registration order. */
  list(): RegisteredCardTool[];
}

/**
 * Creates a card-tool registry backed by `store`. Tools registered against it
 * share that store, so their settings sit alongside every other feature's
 * settings and persist/reset through the same seam.
 */
export function createCardToolRegistry(
  store: PreferenceStore,
): CardToolRegistry {
  // Insertion-ordered, so `list` yields a stable toolbar order across reloads.
  const tools = new Map<string, RegisteredCardTool>();

  function register<S extends SectionSchema>(
    definition: CardToolDefinition<S>,
  ): RegisteredCardTool<S> {
    if (!definition.id) {
      throw new Error("Card tool registration requires a non-empty id.");
    }
    if (!definition.label) {
      throw new Error(
        `Card tool "${definition.id}" registration requires a non-empty label.`,
      );
    }

    const existing = tools.get(definition.id);
    if (existing) {
      if (existing.label !== definition.label) {
        throw new Error(
          `Card tool "${definition.id}" is already registered with a different ` +
            `label ("${existing.label}" vs "${definition.label}"). Re-registration ` +
            `must describe the same tool; change the tool id instead of reusing it.`,
        );
      }
      // The store enforces settings-schema equality: an idempotent re-register
      // for a matching schema, or a throw naming the section for a mismatch.
      store.registerSection(sectionOf(definition));
      return existing as RegisteredCardTool<S>;
    }

    const settings = store.registerSection(sectionOf(definition));
    const registered: RegisteredCardTool<S> = {
      id: definition.id,
      label: definition.label,
      settings,
      apply: (editor) =>
        definition.applyToSelection(editor, settings.getAll()),
    };
    tools.set(definition.id, registered as RegisteredCardTool);
    return registered;
  }

  function get<S extends SectionSchema = SectionSchema>(
    id: string,
  ): RegisteredCardTool<S> | undefined {
    return tools.get(id) as RegisteredCardTool<S> | undefined;
  }

  function list(): RegisteredCardTool[] {
    return [...tools.values()];
  }

  return { register, get, list };
}

/** Builds the store section a tool's settings register under. */
function sectionOf<S extends SectionSchema>(
  definition: CardToolDefinition<S>,
): SectionDefinition<S> {
  return {
    id: toolSectionId(definition.id),
    title: definition.label,
    description: definition.description,
    fields: definition.settings,
  };
}
