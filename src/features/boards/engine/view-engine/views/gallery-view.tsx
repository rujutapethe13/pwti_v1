"use client";

/**
 * Gallery View Renderer
 *
 * Image-forward card grid with thumbnail, title, status, tags, and assignee.
 * Architecture and renderer contract for this milestone — full visual polish
 * can come later, but the renderer is fully functional.
 *
 * ── Data Flow ──────────────────────────────────────────────
 * All writes go through onCellChange → existing CRUD services.
 * No view mutates records directly. No view queries Supabase.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { CellRenderer } from "../../components/cell-renderer";

import type { ViewRendererProps } from "../view-engine-types";
import type { ColumnValue, GalleryViewSettings } from "../../types";
import { getColumnOptions, resolveOptionDisplay } from "../../lib/option-lookup";

// ── Helpers ────────────────────────────────────────────────

function getFirstImageUrl(
  recordId: string,
  imageColumnId: string,
  cellValues: Map<string, ColumnValue>,
): string | null {
  const key = `${recordId}:${imageColumnId}`;
  const value = cellValues.get(key);
  if (!value) return null;

  // Handle string URL, array of URLs, or object with url field
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "string") return first;
    if (typeof first === "object" && first !== null) return String((first as Record<string, unknown>).url ?? "");
  }
  return null;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Gallery View ───────────────────────────────────────────

export function GalleryView({
  board,
  view,
  columns,
  records,
  cellValues,
  groups,
  settings,
  onCellChange,
  onSettingsChange,
  isActive,
}: ViewRendererProps) {
  const gallerySettings = settings as GalleryViewSettings;
  const titleColumnId = gallerySettings.titleColumnId;
  const imageColumnId = gallerySettings.imageColumnId;
  const cardSize = gallerySettings.cardSize ?? "normal";
  const aspectRatio = gallerySettings.aspectRatio ?? "4:3";

  // Find display columns
  const statusColumns = useMemo(
    () => columns.filter((c) => c.type === "status" || c.type === "priority" || c.type === "tags"),
    [columns],
  );
  const personColumns = useMemo(
    () => columns.filter((c) => c.type === "person"),
    [columns],
  );

  // Empty state
  if (records.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-dashed border-border bg-card p-12">
        <EmptyState
          title="No records yet"
          description="Create a record to see it in the gallery."
          compact
        />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────
  const gridCols =
    cardSize === "compact" ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6"
    : cardSize === "wide" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
    : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className={cn("grid gap-4 p-4", gridCols)}>
        {records.map((record) => {
          const imageUrl = getFirstImageUrl(record.id, imageColumnId, cellValues);

          return (
            <Card key={record.id} className="group overflow-hidden border-border bg-card transition-all hover:shadow-md">
              {/* Thumbnail */}
              <div
                className="relative w-full overflow-hidden bg-muted"
                style={{ aspectRatio: aspectRatio.replace(":", "/") }}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={record.title}
                    className="size-full object-cover transition-transform group-hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <span className="text-2xl font-bold text-muted-foreground/30">
                      {record.title.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Card info */}
              <div className="p-3 space-y-2">
                {/* Title */}
                <h3 className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                  {record.title}
                </h3>

                {/* Status badges */}
                {statusColumns.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {statusColumns.slice(0, 2).map((col) => {
                      const value = cellValues.get(`${record.id}:${col.id}`);
                      if (!value) return null;
                      // Cells hold the option id; show the option's label.
                      const label = resolveOptionDisplay(getColumnOptions(col), value).label;
                      if (!label) return null;
                      return (
                        <Badge key={col.id} variant="secondary" className="text-[9px] px-1.5">
                          {label}
                        </Badge>
                      );
                    })}
                  </div>
                )}

                {/* Assignee */}
                {personColumns.length > 0 && (
                  <div className="flex items-center gap-2">
                    {personColumns.slice(0, 1).map((col) => {
                      const value = cellValues.get(`${record.id}:${col.id}`);
                      if (!value) return null;
                      const name = String(value);
                      return (
                        <div key={col.id} className="flex items-center gap-1.5">
                          <Avatar className="size-5">
                            <AvatarFallback className="text-[8px]">
                              {getInitials(name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-[9px] text-muted-foreground">{name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>
          {records.length} record{records.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

