"use client";

/**
 * Calendar Settings Panel
 *
 * Right-side slide-out panel with accordion sections for configuring
 * the calendar view. All options are dynamically populated from the
 * board's actual columns and values.
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Columns3,
  Clock,
  Palette,
  Tag,
  Settings2,
  Users,
  Check,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CalendarViewSettings, ColumnDefinition } from "../../types";

// ── Props ──────────────────────────────────────────────────

interface CalendarSettingsPanelProps {
  settings: CalendarViewSettings;
  columns: ColumnDefinition[];
  groups: Array<{ id: string; name: string; color?: string }>;
  onSettingsChange: (settings: Partial<CalendarViewSettings>) => void;
  onClose: () => void;
}

// ── Section IDs ─────────────────────────────────────────────

type SectionId = "columns" | "timeRange" | "colorBy" | "labelBy" | "additional" | "groups";

// ── Component ───────────────────────────────────────────────

export function CalendarSettingsPanel({
  settings,
  columns,
  groups,
  onSettingsChange,
  onClose,
}: CalendarSettingsPanelProps) {
  const [expandedSection, setExpandedSection] = useState<SectionId | null>("columns");

  const dateColumns = columns.filter((c) => c.type === "date" || c.type === "timeline");
  const statusColumns = columns.filter((c) => c.type === "status");
  const personColumns = columns.filter((c) => c.type === "person");
  const selectedDateCount = settings.selectedDateColumns.length;

  // Get status options with colors from the first status column
  const statusCol = statusColumns[0];
  const statusOptions = (statusCol?.settings?.options as Array<{ id: string; label: string; color: string }>) || [];

  const toggleSection = (section: SectionId) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const handleDateColumnToggle = (columnId: string, checked: boolean) => {
    const newSelection = checked
      ? [...settings.selectedDateColumns, columnId]
      : settings.selectedDateColumns.filter((id) => id !== columnId);
    onSettingsChange({ selectedDateColumns: newSelection });
  };

  const handleGroupToggle = (groupId: string, checked: boolean) => {
    const newGroups = checked
      ? [...settings.visibleGroups, groupId]
      : settings.visibleGroups.filter((id) => id !== groupId);
    onSettingsChange({ visibleGroups: newGroups });
  };

  const handleToggleAllGroups = (checked: boolean) => {
    onSettingsChange({ visibleGroups: checked ? [] : groups.map((g) => g.id) });
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Widget settings</h2>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close settings">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Columns to display ─────────────────────────── */}
        <SectionHeader
          title="Columns to display"
          icon={<Columns3 className="size-4" />}
          expanded={expandedSection === "columns"}
          onClick={() => toggleSection("columns")}
        />
        {expandedSection === "columns" && (
          <div className="px-4 pb-4">
            {dateColumns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No date columns found. Add a date column to use Calendar view.
              </p>
            ) : (
              <div className="space-y-2">
                {dateColumns.map((col) => (
                  <label key={col.id} className="flex items-center gap-2 cursor-pointer group">
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded border transition-colors",
                        settings.selectedDateColumns.includes(col.id)
                          ? "border-primary bg-primary"
                          : "border-input bg-background group-hover:border-primary/50",
                      )}
                      onClick={() => handleDateColumnToggle(col.id, !settings.selectedDateColumns.includes(col.id))}
                    >
                      {settings.selectedDateColumns.includes(col.id) && (
                        <Check className="size-3 text-primary-foreground" />
                      )}
                    </div>
                    <span className="text-sm text-foreground">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Time range ─────────────────────────────────── */}
        <SectionHeader
          title="Time range"
          icon={<Clock className="size-4" />}
          expanded={expandedSection === "timeRange"}
          onClick={() => toggleSection("timeRange")}
          disabled={selectedDateCount < 2}
        />
        {expandedSection === "timeRange" && (
          <div className="px-4 pb-4">
            {selectedDateCount < 2 ? (
              <p className="text-sm text-muted-foreground">
                Add a second date column to set a range.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">Start date</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex h-8 w-full items-center rounded-md border border-input bg-background px-3 text-sm">
                        {dateColumns.find((c) => c.id === settings.selectedDateColumns[0])?.label || "Select column"}
                        <ChevronDown className="ml-auto size-3.5 opacity-50" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-full">
                      {dateColumns.map((col) => (
                        <DropdownMenuItem
                          key={col.id}
                          onSelect={() => {
                            const newCols = [...settings.selectedDateColumns];
                            newCols[0] = col.id;
                            onSettingsChange({ selectedDateColumns: newCols });
                          }}
                        >
                          {col.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">End date</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex h-8 w-full items-center rounded-md border border-input bg-background px-3 text-sm">
                        {dateColumns.find((c) => c.id === settings.selectedDateColumns[1])?.label || "Select column"}
                        <ChevronDown className="ml-auto size-3.5 opacity-50" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-full">
                      {dateColumns.map((col) => (
                        <DropdownMenuItem
                          key={col.id}
                          onSelect={() => {
                            const newCols = [...settings.selectedDateColumns];
                            newCols[1] = col.id;
                            onSettingsChange({ selectedDateColumns: newCols });
                          }}
                        >
                          {col.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Color by ───────────────────────────────────── */}
        <SectionHeader
          title="Color by"
          icon={<Palette className="size-4" />}
          expanded={expandedSection === "colorBy"}
          onClick={() => toggleSection("colorBy")}
        />
        {expandedSection === "colorBy" && (
          <div className="px-4 pb-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-8 w-full items-center rounded-md border border-input bg-background px-3 text-sm">
                  {settings.colorBy === "none" && "None"}
                  {settings.colorBy === "status" && statusCol?.label && statusColumns.length > 0 ? statusCol.label : "Status"}
                  {settings.colorBy === "person" && (personColumns[0]?.label || "Owner / Person")}
                  {settings.colorBy === "group" && "Group"}
                  {settings.colorBy === "board" && "Board"}
                  <ChevronDown className="ml-auto size-3.5 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full">
                <DropdownMenuItem onSelect={() => onSettingsChange({ colorBy: "none" })}>None</DropdownMenuItem>
                {statusColumns.map((col) => (
                  <DropdownMenuItem key={col.id} onSelect={() => onSettingsChange({ colorBy: "status" })}>
                    {col.label}
                  </DropdownMenuItem>
                ))}
                {personColumns.map((col) => (
                  <DropdownMenuItem key={col.id} onSelect={() => onSettingsChange({ colorBy: "person" })}>
                    {col.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onSelect={() => onSettingsChange({ colorBy: "group" })}>Group</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onSettingsChange({ colorBy: "board" })}>Board</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Show status color legend when coloring by status */}
            {settings.colorBy === "status" && statusOptions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {statusOptions.map((opt) => (
                  <div key={opt.id} className="flex items-center gap-1">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: opt.color }} />
                    <span className="text-sm text-muted-foreground">{opt.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Label by ───────────────────────────────────── */}
        <SectionHeader
          title="Label by"
          icon={<Tag className="size-4" />}
          expanded={expandedSection === "labelBy"}
          onClick={() => toggleSection("labelBy")}
        />
        {expandedSection === "labelBy" && (
          <div className="px-4 pb-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div
                  className={cn(
                    "flex size-4 items-center justify-center rounded border transition-colors",
                    settings.labelBy.length === 0
                      ? "border-primary bg-primary"
                      : "border-input bg-background group-hover:border-primary/50",
                  )}
                  onClick={() => onSettingsChange({ labelBy: [] })}
                >
                  {settings.labelBy.length === 0 && <Check className="size-3 text-primary-foreground" />}
                </div>
                <span className="text-sm text-foreground">None</span>
              </label>
              {/* Board name option */}
              <label className="flex items-center gap-2 cursor-pointer group">
                <div
                  className={cn(
                    "flex size-4 items-center justify-center rounded border transition-colors",
                    settings.labelBy.includes("board")
                      ? "border-primary bg-primary"
                      : "border-input bg-background group-hover:border-primary/50",
                  )}
                  onClick={() => {
                    const newLabel = settings.labelBy.includes("board") ? [] : ["board"];
                    onSettingsChange({ labelBy: newLabel });
                  }}
                >
                  {settings.labelBy.includes("board") && <Check className="size-3 text-primary-foreground" />}
                </div>
                <span className="text-sm text-foreground">Board name</span>
              </label>
              {/* Group name option */}
              <label className="flex items-center gap-2 cursor-pointer group">
                <div
                  className={cn(
                    "flex size-4 items-center justify-center rounded border transition-colors",
                    settings.labelBy.includes("group")
                      ? "border-primary bg-primary"
                      : "border-input bg-background group-hover:border-primary/50",
                  )}
                  onClick={() => {
                    const newLabel = settings.labelBy.includes("group") ? [] : ["group"];
                    onSettingsChange({ labelBy: newLabel });
                  }}
                >
                  {settings.labelBy.includes("group") && <Check className="size-3 text-primary-foreground" />}
                </div>
                <span className="text-sm text-foreground">Group name</span>
              </label>
              {/* Dynamic columns from board */}
              {columns
                .filter((c) => c.type !== "date" && c.type !== "timeline")
                .map((col) => (
                  <label key={col.id} className="flex items-center gap-2 cursor-pointer group">
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded border transition-colors",
                        settings.labelBy.includes(col.id)
                          ? "border-primary bg-primary"
                          : "border-input bg-background group-hover:border-primary/50",
                      )}
                      onClick={() => {
                        const newLabel = settings.labelBy.includes(col.id) ? [] : [col.id];
                        onSettingsChange({ labelBy: newLabel });
                      }}
                    >
                      {settings.labelBy.includes(col.id) && <Check className="size-3 text-primary-foreground" />}
                    </div>
                    <span className="text-sm text-foreground">{col.label}</span>
                  </label>
                ))}
            </div>
          </div>
        )}

        {/* ── Additional settings ────────────────────────── */}
        <SectionHeader
          title="Additional settings"
          icon={<Settings2 className="size-4" />}
          expanded={expandedSection === "additional"}
          onClick={() => toggleSection("additional")}
        />
        {expandedSection === "additional" && (
          <div className="px-4 pb-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div
                className={cn(
                  "flex size-4 items-center justify-center rounded border transition-colors",
                  settings.showHours
                    ? "border-primary bg-primary"
                    : "border-input bg-background group-hover:border-primary/50",
                )}
                onClick={() => onSettingsChange({ showHours: !settings.showHours })}
              >
                {settings.showHours && <Check className="size-3 text-primary-foreground" />}
              </div>
              <span className="text-sm text-foreground">Show hours</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <div
                className={cn(
                  "flex size-4 items-center justify-center rounded border transition-colors",
                  !settings.hideWeekends
                    ? "border-primary bg-primary"
                    : "border-input bg-background group-hover:border-primary/50",
                )}
                onClick={() => onSettingsChange({ hideWeekends: !settings.hideWeekends })}
              >
                {!settings.hideWeekends && <Check className="size-3 text-primary-foreground" />}
              </div>
              <span className="text-sm text-foreground">Show weekends</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <div
                className={cn(
                  "flex size-4 items-center justify-center rounded border transition-colors",
                  settings.hideItemNames
                    ? "border-primary bg-primary"
                    : "border-input bg-background group-hover:border-primary/50",
                )}
                onClick={() => onSettingsChange({ hideItemNames: !settings.hideItemNames })}
              >
                {settings.hideItemNames && <Check className="size-3 text-primary-foreground" />}
              </div>
              <span className="text-sm text-foreground">Hide item names</span>
            </label>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Default event duration</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-8 w-full items-center rounded-md border border-input bg-background px-3 text-sm">
                    {settings.defaultEventDuration} min
                    <ChevronDown className="ml-auto size-3.5 opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-full">
                  <DropdownMenuItem onSelect={() => onSettingsChange({ defaultEventDuration: 15 })}>15 min</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onSettingsChange({ defaultEventDuration: 30 })}>30 min</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onSettingsChange({ defaultEventDuration: 60 })}>60 min</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {/* ── Groups ─────────────────────────────────────── */}
        <SectionHeader
          title="Groups"
          icon={<Users className="size-4" />}
          expanded={expandedSection === "groups"}
          onClick={() => toggleSection("groups")}
        />
        {expandedSection === "groups" && (
          <div className="px-4 pb-4">
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No groups on this board.</p>
            ) : (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div
                    className={cn(
                      "flex size-4 items-center justify-center rounded border transition-colors",
                      settings.visibleGroups.length === 0
                        ? "border-primary bg-primary"
                        : "border-input bg-background group-hover:border-primary/50",
                    )}
                    onClick={() => handleToggleAllGroups(settings.visibleGroups.length !== 0)}
                  >
                    {settings.visibleGroups.length === 0 && <Check className="size-3 text-primary-foreground" />}
                  </div>
                  <span className="text-sm font-medium text-foreground">All groups</span>
                </label>
                {groups.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded border transition-colors",
                        settings.visibleGroups.length === 1 && settings.visibleGroups[0] === groups[0].id
                          ? "border-primary bg-primary"
                          : "border-input bg-background group-hover:border-primary/50",
                      )}
                      onClick={() => {
                        onSettingsChange({
                          visibleGroups: settings.visibleGroups.length === 1 && settings.visibleGroups[0] === groups[0].id
                            ? []
                            : [groups[0].id],
                        });
                      }}
                    >
                      {settings.visibleGroups.length === 1 && settings.visibleGroups[0] === groups[0].id && (
                        <Check className="size-3 text-primary-foreground" />
                      )}
                    </div>
                    <span className="text-sm text-foreground">
                      Top group (currently &apos;{groups[0].name}&apos;)
                    </span>
                  </label>
                )}
                {groups.map((group) => (
                  <label key={group.id} className="flex items-center gap-2 cursor-pointer group">
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded border transition-colors",
                        !settings.visibleGroups.includes(group.id)
                          ? "border-primary bg-primary"
                          : "border-input bg-background group-hover:border-primary/50",
                      )}
                      onClick={() => handleGroupToggle(group.id, !settings.visibleGroups.includes(group.id))}
                    >
                      {!settings.visibleGroups.includes(group.id) && (
                        <Check className="size-3 text-primary-foreground" />
                      )}
                    </div>
                    <span className="text-sm text-foreground">{group.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section Header ──────────────────────────────────────────

function SectionHeader({
  title,
  icon,
  expanded,
  onClick,
  disabled = false,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 border-b border-border px-4 py-3 text-left transition-colors",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50",
      )}
    >
      {icon}
      <span className="flex-1 text-sm font-medium text-foreground">{title}</span>
      <ChevronDown
        className={cn(
          "size-3.5 text-muted-foreground transition-transform",
          expanded && "rotate-180",
        )}
      />
    </button>
  );
}
