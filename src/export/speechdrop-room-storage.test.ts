/**
 * Tests for the last-used SpeechDrop room-code persistence. Driven through an
 * isolated stub Storage (like the dock-layout storage tests): round-trip,
 * default-on-missing, empty-value handling, and best-effort write failures.
 */
import { describe, expect, it, vi } from "vitest";

import {
  readLastRoomCode,
  writeLastRoomCode,
  SPEECHDROP_ROOM_STORAGE_KEY,
  type SpeechDropRoomStorage,
} from "./speechdrop-room-storage";

function stubStorage(initial: Record<string, string> = {}): SpeechDropRoomStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe("speechdrop room storage", () => {
  it("round-trips a room code", () => {
    const storage = stubStorage();
    writeLastRoomCode("aB3dEf", storage);
    expect(readLastRoomCode(storage)).toBe("aB3dEf");
  });

  it("returns null when nothing is stored", () => {
    expect(readLastRoomCode(stubStorage())).toBeNull();
  });

  it("returns null when no storage is available", () => {
    expect(readLastRoomCode(null)).toBeNull();
  });

  it("trims stored codes and treats blank as null", () => {
    const storage = stubStorage({ [SPEECHDROP_ROOM_STORAGE_KEY]: "  abc  " });
    expect(readLastRoomCode(storage)).toBe("abc");
    const blank = stubStorage({ [SPEECHDROP_ROOM_STORAGE_KEY]: "   " });
    expect(readLastRoomCode(blank)).toBeNull();
  });

  it("ignores an empty write", () => {
    const setItem = vi.fn();
    writeLastRoomCode("   ", { getItem: () => null, setItem });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("swallows a write failure", () => {
    const throwing: SpeechDropRoomStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => writeLastRoomCode("abc", throwing)).not.toThrow();
  });

  it("swallows a read failure", () => {
    const throwing: SpeechDropRoomStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(readLastRoomCode(throwing)).toBeNull();
  });
});
