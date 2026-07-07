/**
 * Behavioral tests for the **Email export target** - the transport is stubbed
 * (an injected `openUrl`), so these assert the seam without opening a real mail
 * client: the `mailto:` draft is built from the payload, a successful open
 * reports `ok: true`, and a failed open reports `ok: false` with a readable
 * reason rather than throwing (the PRD's success/failure reporting seam).
 */
import { describe, expect, it, vi } from "vitest";

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
    const params = new URLSearchParams(url.slice("mailto:?".length));
    expect(params.get("subject")).toBe("My 1AC");
    expect(params.get("body")).toBe(
      "1AC\n\nContention one: warming is real.",
    );
    // The rich HTML is never smuggled into the mailto body.
    expect(url).not.toContain("<strong>");
  });

  it("omits empty fields", () => {
    expect(mailtoUrl({ subject: "", html: "", text: "" })).toBe("mailto:");
  });
});

describe("createEmailTarget", () => {
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

  it("reports failure without throwing when the opener rejects", async () => {
    const openUrl = vi.fn().mockRejectedValue(new Error("no mail app"));
    const target = createEmailTarget(openUrl);

    const result = await target.export(payload);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("no mail app");
  });

  it("tolerates a non-Error rejection", async () => {
    const openUrl = vi.fn().mockRejectedValue("boom");
    const target = createEmailTarget(openUrl);

    const result = await target.export(payload);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("boom");
  });
});
