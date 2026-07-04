import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees between tests so they stay isolated.
afterEach(() => {
  cleanup();
});
