import { useState } from "react";

import { usePreferenceStore } from "../preferences";
import { useSettingsPanels } from "./useSettingsPanels";

/**
 * The Settings screen: a master-detail shell over the shared preference store.
 *
 * The left rail lists every registered section (in registration order) as a
 * navigable entry; the right pane renders the selected section's contributed
 * panel - or a placeholder when a section has registered its schema but not yet
 * shipped a panel. Each section offers a reset-to-defaults control that restores
 * that section only (the store's `reset` is section-scoped).
 *
 * The screen paints synchronously from the in-memory store - nothing here awaits
 * a network resource, so the local-first boot rule holds.
 */
export default function SettingsScreen() {
  const store = usePreferenceStore();
  const panels = useSettingsPanels();
  const sections = store.listSections();

  // Track the active section by id (stable across re-renders as sections come
  // and go); fall back to the first registered section when the id is unknown.
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const active =
    sections.find((section) => section.id === activeId) ?? sections[0];

  return (
    <section
      aria-labelledby="screen-heading"
      className="flex flex-1 min-h-0 flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="screen-heading"
          className="text-2xl font-semibold tracking-tight text-shell-text"
        >
          Settings
        </h2>
        <p className="max-w-prose text-sm text-shell-muted">
          Adjust preferences for each area of the app. Sections are contributed
          by their features and apply as you change them.
        </p>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-lg border border-shell-border bg-shell-surface p-card text-sm text-shell-muted">
          No settings sections are registered yet.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          <nav
            aria-label="Settings sections"
            className="flex w-56 shrink-0 flex-col gap-1"
          >
            {sections.map((section) => {
              const isActive = active?.id === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setActiveId(section.id)}
                  className={
                    isActive
                      ? "rounded-md border border-shell-border bg-shell-surface px-3 py-2 text-left text-sm font-medium text-shell-text"
                      : "rounded-md px-3 py-2 text-left text-sm font-medium text-shell-muted transition-colors hover:bg-shell-surface hover:text-shell-text"
                  }
                >
                  {section.title ?? section.id}
                </button>
              );
            })}
          </nav>

          {active && (
            <SectionDetail
              key={active.id}
              sectionId={active.id}
              title={active.title ?? active.id}
              description={active.description}
              store={store}
              panels={panels}
            />
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The detail pane for one section: its heading, its contributed panel (or a
 * placeholder), and the section-scoped reset control.
 */
function SectionDetail({
  sectionId,
  title,
  description,
  store,
  panels,
}: {
  sectionId: string;
  title: string;
  description?: string;
  store: ReturnType<typeof usePreferenceStore>;
  panels: ReturnType<typeof useSettingsPanels>;
}) {
  const handle = store.getSection(sectionId);
  const Panel = panels[sectionId];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-shell-border bg-shell-surface p-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-shell-text">{title}</h3>
          {description && (
            <p className="max-w-prose text-sm text-shell-muted">{description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => handle?.reset()}
          disabled={!handle}
          className="shrink-0 rounded border border-shell-border bg-shell-surface px-3 py-1.5 text-sm text-shell-text transition-colors hover:bg-shell-bg disabled:opacity-50"
        >
          Reset to defaults
        </button>
      </div>

      <div className="mt-4">
        {Panel && handle ? (
          <Panel handle={handle} />
        ) : (
          <p className="text-sm text-shell-muted">
            No settings UI has been contributed for this section yet.
          </p>
        )}
      </div>
    </div>
  );
}
