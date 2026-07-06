import { NavLink, Outlet } from "react-router-dom";

/** The three primary areas the app frame navigates between. */
const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/blocks", label: "Block File", end: false },
  { to: "/rounds", label: "Rounds", end: false },
  { to: "/speeches", label: "Speeches", end: false },
  { to: "/settings", label: "Settings", end: false },
] as const;

function navLinkClass({ isActive }: { isActive: boolean }): string {
  const base =
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
  return isActive
    ? `${base} bg-shell-surface border border-shell-border text-shell-text`
    : `${base} text-shell-muted hover:bg-shell-surface hover:text-shell-text`;
}

/**
 * The persistent application frame: navigation chrome plus a routed content
 * outlet. Every feature screen mounts inside the <Outlet />. Renders entirely
 * offline - nothing here awaits a network resource.
 */
export default function RootLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-shell-bg text-shell-text">
      <header className="border-b border-shell-border">
        <div className="flex items-center gap-6 px-6 py-3">
          <span className="text-sm font-semibold tracking-tight">
            Fulcrum Debate
          </span>
          <nav aria-label="Primary" className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navLinkClass}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex flex-1 flex-col min-h-0 overflow-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
