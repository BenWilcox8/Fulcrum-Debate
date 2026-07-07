/**
 * Tests for the SpeechDrop export target. They drive it with a **stubbed upload
 * transport** and a stub prompt (no network, no React), asserting payload
 * correctness (room code, RTF file + mime, formatting preserved) and every error
 * path the PRD calls out: a cancelled prompt, an empty code, a network failure,
 * and a bad room code (the message the transport rejects with is surfaced).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSpeechDropTarget, SPEECHDROP_UPLOAD_MIME } from "./speechdrop-target";
import type { ExportPayload } from "./target";

const payload: ExportPayload = {
  subject: "1AC vs Kansas",
  html: "<h1>Contention 1</h1><p><strong>Warming</strong> is real</p>",
  text: "Contention 1\n\nWarming is real",
};

/** Decodes a base64 (UTF-8) string the way the target encodes it. */
function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

describe("createSpeechDropTarget", () => {
  // The error paths log the raw failure via console.error (kept out of the UI);
  // silence it so the intentional error-path tests don't clutter test output.
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prompts for the room code, uploads an RTF file, and reports success", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const promptRoomCode = vi.fn().mockResolvedValue("aB3dEf");
    const setLastRoomCode = vi.fn();

    const target = createSpeechDropTarget({
      upload,
      promptRoomCode,
      getLastRoomCode: () => "old99",
      setLastRoomCode,
    });

    const result = await target.export(payload);

    // The prompt is seeded with the last-used code.
    expect(promptRoomCode).toHaveBeenCalledWith("old99");

    // The upload carries the room code, an RTF file, and the RTF mime.
    expect(upload).toHaveBeenCalledTimes(1);
    const args = upload.mock.calls[0][0];
    expect(args.roomCode).toBe("aB3dEf");
    expect(args.contentType).toBe(SPEECHDROP_UPLOAD_MIME);
    expect(args.fileName).toBe("1AC vs Kansas.rtf");

    // Formatting is preserved: the RTF has the heading + bold from the payload.
    const rtf = decodeBase64Utf8(args.contentBase64);
    expect(rtf.startsWith("{\\rtf1")).toBe(true);
    expect(rtf).toContain("Warming");
    expect(rtf).toContain("\\b ");

    // Success persists the code and reports it.
    expect(setLastRoomCode).toHaveBeenCalledWith("aB3dEf");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("aB3dEf");
  });

  it("trims the entered room code", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const target = createSpeechDropTarget({
      upload,
      promptRoomCode: () => Promise.resolve("  room1  "),
    });

    await target.export(payload);

    expect(upload.mock.calls[0][0].roomCode).toBe("room1");
  });

  it("is a clean no-op when the prompt is cancelled", async () => {
    const upload = vi.fn();
    const target = createSpeechDropTarget({
      upload,
      promptRoomCode: () => Promise.resolve(null),
    });

    const result = await target.export(payload);

    expect(upload).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.neutral).toBe(true);
    expect(result.message).toMatch(/cancel/i);
  });

  it("reports and skips upload when the code is empty", async () => {
    const upload = vi.fn();
    const target = createSpeechDropTarget({
      upload,
      promptRoomCode: () => Promise.resolve("   "),
    });

    const result = await target.export(payload);

    expect(upload).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/room code/i);
  });

  it("surfaces a network failure as feedback without throwing", async () => {
    const target = createSpeechDropTarget({
      upload: () =>
        Promise.reject(new Error("Could not reach SpeechDrop. Check your connection.")),
      promptRoomCode: () => Promise.resolve("aB3dEf"),
    });

    const result = await target.export(payload);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/could not reach speechdrop/i);
  });

  it("surfaces a bad-room-code rejection from the transport", async () => {
    const setLastRoomCode = vi.fn();
    const target = createSpeechDropTarget({
      upload: () =>
        Promise.reject(new Error("That SpeechDrop room code wasn't found.")),
      promptRoomCode: () => Promise.resolve("zzz999"),
      setLastRoomCode,
    });

    const result = await target.export(payload);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/wasn't found/i);
    // A failed upload does not persist the code.
    expect(setLastRoomCode).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the transport rejects with no message", async () => {
    const target = createSpeechDropTarget({
      upload: () => Promise.reject(new Error("")),
      promptRoomCode: () => Promise.resolve("aB3dEf"),
    });

    const result = await target.export(payload);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/could not upload/i);
  });

  it("derives a safe RTF file name from a subject with illegal characters", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const target = createSpeechDropTarget({
      upload,
      promptRoomCode: () => Promise.resolve("aB3dEf"),
    });

    await target.export({ ...payload, subject: 'a/b:c*?"<>|' });

    expect(upload.mock.calls[0][0].fileName).toBe("abc.rtf");
  });
});
