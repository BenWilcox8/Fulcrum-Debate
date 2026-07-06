import { describe, it, expect, vi } from "vitest";
import { createPreferenceStore } from "./store";
import type { SectionDefinition } from "./types";

/**
 * A representative feature section: mixed value types plus self-describing
 * metadata (label/description/options) so the schema alone can drive a UI.
 */
function formattingSection() {
  return {
    id: "formatting",
    title: "Formatting",
    fields: {
      fontSize: { default: "11pt", label: "Body font size", options: ["10pt", "11pt", "12pt"] },
      autoShrink: { default: true, label: "Auto-shrink cards" },
      maxLines: { default: 8, description: "Lines before a card wraps" },
    },
  } satisfies SectionDefinition;
}

describe("createPreferenceStore", () => {
  describe("registration + defaults", () => {
    it("reads a registered key's default when it has never been set", () => {
      const store = createPreferenceStore();
      const section = store.registerSection(formattingSection());

      expect(section.get("fontSize")).toBe("11pt");
      expect(section.get("autoShrink")).toBe(true);
      expect(section.get("maxLines")).toBe(8);
      expect(section.getAll()).toEqual({
        fontSize: "11pt",
        autoShrink: true,
        maxLines: 8,
      });
    });

    it("exposes the self-describing definition for rendering", () => {
      const store = createPreferenceStore();
      const section = store.registerSection(formattingSection());

      expect(section.definition.title).toBe("Formatting");
      expect(section.definition.fields.fontSize.label).toBe("Body font size");
      expect(section.definition.fields.fontSize.options).toEqual([
        "10pt",
        "11pt",
        "12pt",
      ]);
      expect(store.listSections().map((d) => d.id)).toEqual(["formatting"]);
    });

    it("returns the same registered section by id via getSection", () => {
      const store = createPreferenceStore();
      const section = store.registerSection(formattingSection());
      expect(store.getSection("formatting")).toBe(section);
      expect(store.getSection("missing")).toBeUndefined();
    });
  });

  describe("set + read", () => {
    it("reflects a set value immediately on subsequent reads", () => {
      const store = createPreferenceStore();
      const section = store.registerSection(formattingSection());

      section.set("fontSize", "12pt");
      section.set("autoShrink", false);

      expect(section.get("fontSize")).toBe("12pt");
      expect(section.get("autoShrink")).toBe(false);
      // Unset keys still fall back to their default.
      expect(section.get("maxLines")).toBe(8);
    });

    it("isolates sections from one another", () => {
      const store = createPreferenceStore();
      const formatting = store.registerSection(formattingSection());
      const shorthand = store.registerSection({
        id: "shorthand",
        fields: { enabled: { default: false } },
      } satisfies SectionDefinition);

      formatting.set("fontSize", "10pt");
      expect(shorthand.get("enabled")).toBe(false);
      expect(formatting.get("fontSize")).toBe("10pt");
    });
  });

  describe("subscription seam", () => {
    it("notifies a section subscriber on set, with the current values", () => {
      const store = createPreferenceStore();
      const section = store.registerSection(formattingSection());
      const listener = vi.fn();

      const unsubscribe = section.subscribe(listener);
      section.set("fontSize", "12pt");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ fontSize: "12pt" }),
      );

      unsubscribe();
      section.set("fontSize", "10pt");
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("does not fire immediately on subscribe (snapshot is read separately)", () => {
      const store = createPreferenceStore();
      const section = store.registerSection(formattingSection());
      const listener = vi.fn();

      section.subscribe(listener);
      expect(listener).not.toHaveBeenCalled();
    });

    it("only notifies subscribers of the section that changed", () => {
      const store = createPreferenceStore();
      const formatting = store.registerSection(formattingSection());
      const shorthand = store.registerSection({
        id: "shorthand",
        fields: { enabled: { default: false } },
      } satisfies SectionDefinition);

      const formattingListener = vi.fn();
      const shorthandListener = vi.fn();
      formatting.subscribe(formattingListener);
      shorthand.subscribe(shorthandListener);

      formatting.set("fontSize", "12pt");
      expect(formattingListener).toHaveBeenCalledTimes(1);
      expect(shorthandListener).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("restores every key to its registered default and notifies", () => {
      const store = createPreferenceStore();
      const section = store.registerSection(formattingSection());
      const listener = vi.fn();
      section.subscribe(listener);

      section.set("fontSize", "12pt");
      section.set("autoShrink", false);
      listener.mockClear();

      section.reset();

      expect(section.getAll()).toEqual({
        fontSize: "11pt",
        autoShrink: true,
        maxLines: 8,
      });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("duplicate registration (no silent data loss)", () => {
    it("is idempotent for a structurally identical schema and preserves set values", () => {
      const store = createPreferenceStore();
      const first = store.registerSection(formattingSection());
      first.set("fontSize", "12pt");

      // A second registration (e.g. StrictMode re-run) with the same schema.
      const second = store.registerSection(formattingSection());

      expect(second).toBe(first);
      // The previously set value is not clobbered back to the default.
      expect(second.get("fontSize")).toBe("12pt");
      expect(store.listSections()).toHaveLength(1);
    });

    it("throws a clear error when re-registering an id with a different schema", () => {
      const store = createPreferenceStore();
      store.registerSection(formattingSection());

      expect(() =>
        store.registerSection({
          id: "formatting",
          fields: { fontSize: { default: "9pt" } },
        } satisfies SectionDefinition),
      ).toThrow(/formatting/);
    });
  });

  describe("snapshot immutability", () => {
    it("does not let a mutated getAll() result corrupt stored state", () => {
      const store = createPreferenceStore();
      const section = store.registerSection({
        id: "tools",
        fields: { recent: { default: ["a", "b"] as string[] } },
      } satisfies SectionDefinition);

      const snapshot = section.getAll();
      snapshot.recent.push("c");

      expect(section.get("recent")).toEqual(["a", "b"]);
    });
  });
});
