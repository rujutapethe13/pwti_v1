"use client";

import { useMemo, useState } from "react";

import { columnTypeRegistry } from "../column-registry";
import type { SettingsPanelProps } from "../types";

const sections = ["general", "formatting", "validation", "permissions", "advanced"] as const;

export function ColumnSettingsPanel({ column, definition, onChange }: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<(typeof sections)[number]>("general");
  const visibleFields = useMemo(
    () => definition.settingsSchema.filter((field) => field.section === activeSection),
    [activeSection, definition.settingsSchema],
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {sections.map((section) => (
          <button
            key={section}
            type="button"
            onClick={() => setActiveSection(section)}
            className={section === activeSection ? "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"}
          >
            {section}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{definition.label}</p>
          <h3 className="text-lg font-medium text-foreground">{column.label}</h3>
          <p className="text-sm text-muted-foreground">{definition.description}</p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {visibleFields.map((field) => {
            const value = field.fromSettings
              ? (column.settings as Record<string, unknown>)[field.name]
              : column[field.name as keyof typeof column];

            const applyChange = (next: unknown) =>
              field.fromSettings
                ? onChange({ settings: { ...column.settings, [field.name]: next } } as Partial<typeof column>)
                : onChange({ [field.name]: next } as Partial<typeof column>);

            return (
              <label key={field.name} className="space-y-1.5 text-sm">
                <span className="block font-medium text-foreground">{field.label}</span>
                {field.type === "textarea" && (
                  <textarea
                    value={typeof value === "string" ? value : String(value ?? "")}
                    placeholder={field.placeholder}
                    onChange={(event) => applyChange(event.target.value)}
                    className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                )}
                {field.type !== "textarea" && field.type !== "checkbox" && field.type !== "select" && field.type !== "json" && field.type !== "formula" && (
                  <input
                    value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
                    placeholder={field.placeholder}
                    onChange={(event) => applyChange(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                )}
                {field.type === "checkbox" && (
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) => applyChange(event.target.checked)}
                    className="size-4 rounded border-border"
                  />
                )}
                {field.type === "select" && (
                  <select
                    value={typeof value === "string" ? value : "auto"}
                    onChange={(event) => applyChange(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
                {field.type === "json" && (
                  <textarea
                    value={JSON.stringify(value ?? {}, null, 2)}
                    onChange={(event) => {
                      try {
                        applyChange(JSON.parse(event.target.value));
                      } catch {
                        applyChange(event.target.value);
                      }
                    }}
                    className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
                  />
                )}
                {field.type === "formula" && (
                  <input
                    value={definition.key === "formula" ? String(column.settings.formula ?? "") : ""}
                    onChange={(event) => onChange({ settings: { ...column.settings, formula: event.target.value } })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                )}
                {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
              </label>
            );
          })}
        </div>

        <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          Type definition source: {columnTypeRegistry[column.type].label}. Changing this column type uses the migration engine rather than a label swap.
        </div>
      </div>
    </div>
  );
}
