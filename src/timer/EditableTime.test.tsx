import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditableTime } from "./EditableTime";

describe("EditableTime", () => {
  it("shows the formatted time as a button until clicked", () => {
    render(<EditableTime seconds={125} onCommit={vi.fn()} label="Prep time" />);

    expect(screen.getByRole("button", { name: "Prep time" })).toHaveTextContent(
      "2:05",
    );
  });

  it("commits a parsed M:SS edit on Enter", () => {
    const onCommit = vi.fn();
    render(<EditableTime seconds={125} onCommit={onCommit} label="Prep time" />);

    fireEvent.click(screen.getByRole("button", { name: "Prep time" }));
    const input = screen.getByRole("textbox", { name: "Prep time" });
    fireEvent.change(input, { target: { value: "0:30" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).toHaveBeenCalledWith(30);
  });

  it("commits on blur", () => {
    const onCommit = vi.fn();
    render(<EditableTime seconds={60} onCommit={onCommit} label="Prep time" />);

    fireEvent.click(screen.getByRole("button", { name: "Prep time" }));
    const input = screen.getByRole("textbox", { name: "Prep time" });
    fireEvent.change(input, { target: { value: "90" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith(90);
  });

  it("discards the edit on Escape and keeps the prior value", () => {
    const onCommit = vi.fn();
    render(<EditableTime seconds={60} onCommit={onCommit} label="Prep time" />);

    fireEvent.click(screen.getByRole("button", { name: "Prep time" }));
    const input = screen.getByRole("textbox", { name: "Prep time" });
    fireEvent.change(input, { target: { value: "0:30" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Prep time" })).toHaveTextContent(
      "1:00",
    );
  });

  it("ignores an unparseable edit without committing", () => {
    const onCommit = vi.fn();
    render(<EditableTime seconds={60} onCommit={onCommit} label="Prep time" />);

    fireEvent.click(screen.getByRole("button", { name: "Prep time" }));
    const input = screen.getByRole("textbox", { name: "Prep time" });
    fireEvent.change(input, { target: { value: "nonsense" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).not.toHaveBeenCalled();
  });
});
