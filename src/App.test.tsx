import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import AppRoutes from "./AppRoutes";

describe("App shell", () => {
  it("mounts with the navigation chrome and the default Dashboard region", () => {
    render(<App />);

    expect(
      screen.getByRole("navigation", { name: /primary/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /dashboard/i }),
    ).toBeInTheDocument();
  });
});

describe("frame navigation", () => {
  function renderAt(initialPath: string) {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <AppRoutes />
      </MemoryRouter>,
    );
  }

  it("switches the routed region when nav links are clicked, without a reload", () => {
    renderAt("/");

    // Starts on Dashboard.
    expect(
      screen.getByRole("heading", { level: 2, name: /dashboard/i }),
    ).toBeInTheDocument();

    // Click through to Block File.
    fireEvent.click(screen.getByRole("link", { name: /block file/i }));
    expect(
      screen.getByRole("heading", { level: 2, name: /block file/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: /dashboard/i }),
    ).not.toBeInTheDocument();

    // And on to Rounds.
    fireEvent.click(screen.getByRole("link", { name: /rounds/i }));
    expect(
      screen.getByRole("heading", { level: 2, name: /rounds/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: /block file/i }),
    ).not.toBeInTheDocument();

    // Back to Dashboard.
    fireEvent.click(screen.getByRole("link", { name: /dashboard/i }));
    expect(
      screen.getByRole("heading", { level: 2, name: /dashboard/i }),
    ).toBeInTheDocument();
  });

  it("renders the deep-linked area on first paint", () => {
    renderAt("/rounds");

    expect(
      screen.getByRole("heading", { level: 2, name: /rounds/i }),
    ).toBeInTheDocument();
  });
});
