import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import StartSomethingNewZone from "./StartSomethingNewZone";

// The zone is boot-path code (the dashboard is the default route), so it holds
// no document service: every action just navigates, and the destination route
// owns the create/open primitive. We assert the navigation targets here and
// prove the primitives fire end-to-end in DashboardScreen.test.tsx.
const navigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

function actions() {
  return screen.getByRole("region", { name: /start something new/i });
}

beforeEach(() => {
  navigate.mockReset();
});

describe("StartSomethingNewZone actions", () => {
  it("ships every action as a live, enabled button (no dead placeholders)", () => {
    render(<StartSomethingNewZone />);

    const buttons = within(actions()).getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const button of buttons) {
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute("aria-disabled", "true");
    }
  });

  it("New round navigates to the create-and-open round route", () => {
    render(<StartSomethingNewZone />);

    fireEvent.click(within(actions()).getByRole("button", { name: /new round/i }));

    expect(navigate).toHaveBeenCalledWith("/rounds/new");
  });

  it("Open block file navigates to the block-file editor", () => {
    render(<StartSomethingNewZone />);

    fireEvent.click(
      within(actions()).getByRole("button", { name: /open block file/i }),
    );

    expect(navigate).toHaveBeenCalledWith("/blocks");
  });

  it("New card navigates to the block file (its interim home)", () => {
    render(<StartSomethingNewZone />);

    fireEvent.click(within(actions()).getByRole("button", { name: /new card/i }));

    expect(navigate).toHaveBeenCalledWith("/blocks");
  });
});
