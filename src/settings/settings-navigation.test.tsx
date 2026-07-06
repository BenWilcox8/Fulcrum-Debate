import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import App from "../App";

/**
 * Whole-shell reachability: the Settings area must be navigable from the real
 * application chrome, and the shipped demo contribution must prove the seam by
 * rendering as a section entry with its panel. Rendering the real {@link App}
 * exercises the production wiring (PreferenceStoreProvider + SettingsProvider +
 * the RootLayout nav), not a hand-assembled tree.
 */
describe("Settings navigation", () => {
  it("reaches the Settings screen from the primary nav chrome", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: /settings/i }));

    expect(
      screen.getByRole("heading", { level: 2, name: /settings/i }),
    ).toBeInTheDocument();
  });

  it("shows the shipped demo section, proving the contribution seam end to end", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: /settings/i }));

    const nav = screen.getByRole("navigation", { name: /settings sections/i });
    expect(within(nav).getByText(/demo/i)).toBeInTheDocument();
    // The demo panel body renders (not the no-panel placeholder).
    expect(screen.queryByText(/no settings ui/i)).not.toBeInTheDocument();
  });
});
