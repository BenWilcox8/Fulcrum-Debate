import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import { uploadToSpeechDrop } from "../../ipc";
import {
  createSpeechDropTarget,
  type SpeechDropUpload,
} from "../speechdrop-target";
import {
  readLastRoomCode,
  writeLastRoomCode,
  type SpeechDropRoomStorage,
} from "../speechdrop-room-storage";
import type { ExportTarget } from "../target";
import { SpeechDropRoomPrompt } from "./SpeechDropRoomPrompt";

/** Options for {@link useSpeechDropTarget} (all optional; overridden in tests). */
export interface UseSpeechDropTargetOptions {
  /** The upload transport. Defaults to the Rust/Tauri boundary. */
  upload?: SpeechDropUpload;
  /** The last-room-code store. Defaults to `localStorage`. */
  storage?: SpeechDropRoomStorage | null;
}

/** What {@link useSpeechDropTarget} returns. */
export interface UseSpeechDropTargetResult {
  /** The SpeechDrop {@link ExportTarget} to pass to the Export action. */
  target: ExportTarget;
  /** The room-code prompt element; render it once in the surface's tree. */
  prompt: ReactNode;
}

/** State for a pending room-code prompt: the seed value + the awaiting resolver. */
interface PendingPrompt {
  initialCode: string;
  resolve: (code: string | null) => void;
}

/** The default upload transport: the Rust/Tauri `speechdrop_upload` boundary. */
const defaultUpload: SpeechDropUpload = (args) => uploadToSpeechDrop(args);

/**
 * Builds the app's SpeechDrop {@link ExportTarget} plus the room-code prompt it
 * drives - the React binding that keeps the {@link ExportButton | Export action}
 * untouched.
 *
 * The target's `promptRoomCode` opens the returned `prompt` modal and resolves
 * the promise the export awaits (the code, or `null` on cancel); the last-used
 * code seeds the field and is persisted on a successful upload. Uploads go
 * through the Tauri boundary by default; tests inject a stubbed `upload` and
 * `storage`.
 *
 * Usage: `const { target, prompt } = useSpeechDropTarget();` then
 * `<ExportButton targets={[emailTarget, target]} … />` and render `{prompt}`.
 */
export function useSpeechDropTarget(
  options: UseSpeechDropTargetOptions = {},
): UseSpeechDropTargetResult {
  const { upload = defaultUpload, storage } = options;
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  // Keep the resolver reachable from the modal callbacks without re-creating the
  // target when a prompt opens.
  const pendingRef = useRef<PendingPrompt | null>(null);
  pendingRef.current = pending;

  const settle = useCallback((code: string | null) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(code);
  }, []);

  const target = useMemo<ExportTarget>(
    () =>
      createSpeechDropTarget({
        upload,
        getLastRoomCode: () => readLastRoomCode(storage),
        setLastRoomCode: (code) => writeLastRoomCode(code, storage),
        promptRoomCode: (lastCode) =>
          new Promise<string | null>((resolve) => {
            const entry: PendingPrompt = {
              initialCode: lastCode ?? "",
              resolve,
            };
            pendingRef.current = entry;
            setPending(entry);
          }),
      }),
    [upload, storage],
  );

  const prompt = (
    <SpeechDropRoomPrompt
      open={pending !== null}
      initialCode={pending?.initialCode ?? ""}
      onSubmit={(code) => settle(code)}
      onCancel={() => settle(null)}
    />
  );

  return { target, prompt };
}
