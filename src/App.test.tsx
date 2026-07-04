import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App shell", () => {
  it("mounts and renders the application title", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { level: 1, name: /fulcrum debate/i }),
    ).toBeInTheDocument();
  });
});
