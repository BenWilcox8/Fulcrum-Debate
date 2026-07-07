/**
 * Tests for the React binding that turns SpeechDrop into an export target driven
 * by an at-export-time room-code prompt, with the Export action untouched. They
 * mount the real {@link ExportButton} over the hook's target (with a **stubbed
 * upload** and stub storage), click "Export to SpeechDrop", drive the modal, and
 * assert the upload payload, success/failure feedback, cancel, and last-code
 * seeding/persistence.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ExportButton } from "./ExportButton";
import { useSpeechDropTarget } from "./useSpeechDropTarget";
import type { SpeechDropUpload } from "../speechdrop-target";
import type { SpeechDropRoomStorage } from "../speechdrop-room-storage";
import type { ExportPayload } from "../target";

const payload: ExportPayload = {
  subject: "Speech",
  html: "<p><strong>Tag</strong> body</p>",
  text: "Tag body",
};

function stubStorage(initial: Record<string, string> = {}): SpeechDropRoomStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

function Harness({
  upload,
  storage,
}: {
  upload: SpeechDropUpload;
  storage: SpeechDropRoomStorage;
}) {
  const { target, prompt } = useSpeechDropTarget({ upload, storage });
  return (
    <div>
      <ExportButton buildPayload={() => payload} targets={[target]} />
      {prompt}
    </div>
  );
}

describe("useSpeechDropTarget", () => {
  it("prompts, uploads on confirm, and reports success", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const storage = stubStorage();

    render(<Harness upload={upload} storage={storage} />);

    fireEvent.click(screen.getByRole("button", { name: /export to speechdrop/i }));

    // The modal appears at export time.
    const input = await screen.findByLabelText(/speechdrop room code/i);
    fireEvent.change(input, { target: { value: "aB3dEf" } });
    fireEvent.click(screen.getByRole("button", { name: /^upload$/i }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    const args = upload.mock.calls[0][0];
    expect(args.roomCode).toBe("aB3dEf");
    expect(args.contentType).toBe("text/rtf");

    await screen.findByText(/uploaded to speechdrop room aB3dEf/i);
    // The modal closes and the code is persisted for next time.
    expect(screen.queryByLabelText(/speechdrop room code/i)).toBeNull();
    expect(storage.getItem("fulcrum:speechdrop-room")).toBe("aB3dEf");
  });

  it("seeds the prompt with the last-used code", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const storage = stubStorage({ "fulcrum:speechdrop-room": "seed42" });

    render(<Harness upload={upload} storage={storage} />);
    fireEvent.click(screen.getByRole("button", { name: /export to speechdrop/i }));

    const input = (await screen.findByLabelText(
      /speechdrop room code/i,
    )) as HTMLInputElement;
    expect(input.value).toBe("seed42");
  });

  it("does not upload when the prompt is cancelled", async () => {
    const upload = vi.fn();
    const storage = stubStorage();

    render(<Harness upload={upload} storage={storage} />);
    fireEvent.click(screen.getByRole("button", { name: /export to speechdrop/i }));

    await screen.findByLabelText(/speechdrop room code/i);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await screen.findByText(/cancel/i);
    expect(upload).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/speechdrop room code/i)).toBeNull();
  });

  it("reports an upload failure as non-intrusive feedback", async () => {
    const upload = vi
      .fn()
      .mockRejectedValue(new Error("That SpeechDrop room code wasn't found."));
    const storage = stubStorage();

    render(<Harness upload={upload} storage={storage} />);
    fireEvent.click(screen.getByRole("button", { name: /export to speechdrop/i }));

    const input = await screen.findByLabelText(/speechdrop room code/i);
    fireEvent.change(input, { target: { value: "zzz999" } });
    fireEvent.click(screen.getByRole("button", { name: /^upload$/i }));

    await screen.findByText(/wasn't found/i);
    expect(storage.getItem("fulcrum:speechdrop-room")).toBeNull();
  });
});
