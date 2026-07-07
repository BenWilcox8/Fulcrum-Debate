/**
 * Behavioral tests for the **Email export target** - the transport is stubbed
 * (an injected `openUrl`), so these assert the seam without opening a real mail
 * client: the `mailto:` draft is built from the payload, a successful open
 * reports `ok: true`, and a failed open reports `ok: false` with a readable
 * reason rather than throwing (the PRD's success/failure reporting seam).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmailTarget, mailtoUrl } from "./email-target";
import type { ExportPayload } from "./target";

const payload: ExportPayload = {
  subject: "My 1AC",
  html: "<!doctype html><html><body><strong>hi</strong></body></html>",
  text: "1AC\n\nContention one: warming is real.",
};

describe("mailtoUrl", () => {
  it("encodes the subject and plain-text body into a mailto draft", () => {
    const url = mailtoUrl(payload);

    expect(url.startsWith("mailto:?")).toBe(true);
    // RFC 6068 requires percent-encoding; spaces must be %20, not +.
    expect(url).toContain("subject=My%201AC");
    expect(url).not.toContain("subject=My+1AC");
    expect(url).toContain("body=1AC");
    // The rich HTML is never smuggled into the mailto body.
    expect(url).not.toContain("<strong>");
    // Round-trip via URLSearchParams must still decode correctly.
    const params = new URLSearchParams(url.slice("mailto:?".length));
    expect(params.get("subject")).toBe("My 1AC");
    expect(params.get("body")).toBe("1AC\n\nContention one: warming is real.");
  });

  it("omits empty fields", () => {
    expect(mailtoUrl({ subject: "", html: "", text: "" })).toBe("mailto:");
  });
});

describe("createEmailTarget", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has the stable id and label", () => {
    const target = createEmailTarget(vi.fn());
    expect(target.id).toBe("email");
    expect(target.label).toBe("Email");
  });

  it("opens the mailto draft through the transport and reports success", async () => {
    const openUrl = vi.fn().mockResolvedValue(undefined);
    const target = createEmailTarget(openUrl);

    const result = await target.export(payload);

    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl.mock.calls[0][0]).toBe(mailtoUrl(payload));
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/email draft/i);
  });

  it("reports a friendly failure without leaking the raw error, and logs it", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = new Error("no mail app");
    const openUrl = vi.fn().mockRejectedValue(error);
    const target = createEmailTarget(openUrl);

    const result = await target.export(payload);

    expect(result.ok).toBe(false);
    // Friendly, fixed line - the raw error text is NOT interpolated into it.
    expect(result.message).toMatch(/could not open your mail app/i);
    expect(result.message).not.toContain("no mail app");
    // The raw error is logged for diagnosis instead.
    expect(consoleError).toHaveBeenCalledWith("Email export failed:", error);
  });

  it("sanitizes the no-Tauri-IPC (plain browser) exception", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    // This is the exact exception the real `invoke` throws in a plain browser,
    // where `window.__TAURI_INTERNALS__` is undefined - it must never reach the UI.
    const tauriError = new TypeError(
      "Cannot read properties of undefined (reading 'invoke')",
    );
    const openUrl = vi.fn().mockRejectedValue(tauriError);
    const target = createEmailTarget(openUrl);

    const result = await target.export(payload);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/could not open your mail app/i);
    // None of the raw TypeError's guts leak to the user.
    expect(result.message).not.toMatch(/invoke|undefined|reading|Cannot read/i);
    expect(consoleError).toHaveBeenCalledWith("Email export failed:", tauriError);
  });

  it("tolerates a non-Error rejection without leaking it", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const openUrl = vi.fn().mockRejectedValue("boom");
    const target = createEmailTarget(openUrl);

    const result = await target.export(payload);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/could not open your mail app/i);
    expect(result.message).not.toContain("boom");
    expect(consoleError).toHaveBeenCalledWith("Email export failed:", "boom");
  });
});
