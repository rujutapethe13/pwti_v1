"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/shared/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveBoardDateMapping,
  type SaveDateMappingResult,
} from "@/features/overview/board-date-mappings-actions";
import type { BoardDateMappingRow } from "@/features/overview/board-date-mappings";

const AUTO_VALUE = "__auto__";

interface Draft {
  upload: string;
  receive: string;
}

function toDraft(row: BoardDateMappingRow): Draft {
  return {
    upload: row.upload_column_id ?? AUTO_VALUE,
    receive: row.receive_column_id ?? AUTO_VALUE,
  };
}

function sourceBadge(source: "mapping" | "label" | null): {
  label: string;
  className: string;
} {
  if (source === "mapping") {
    return { label: "Saved", className: "bg-brand/10 text-brand" };
  }
  if (source === "label") {
    return { label: "Auto-detected", className: "bg-highlight/10 text-highlight" };
  }
  return { label: "Not set", className: "bg-muted text-muted-foreground" };
}

export default function DateMappingsSettingsPage() {
  const [rows, setRows] = useState<BoardDateMappingRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingBoard, setSavingBoard] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/overview/date-mappings", {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        rows?: BoardDateMappingRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load date mappings");
      const nextRows = json.rows ?? [];
      setRows(nextRows);
      const nextDrafts: Record<string, Draft> = {};
      for (const r of nextRows) nextDrafts[r.board_id] = toDraft(r);
      setDrafts(nextDrafts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load date mappings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (boardId: string, field: keyof Draft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [boardId]: { ...prev[boardId], [field]: value },
    }));
  };

  const isDirty = (row: BoardDateMappingRow): boolean => {
    const d = drafts[row.board_id];
    if (!d) return false;
    return (
      d.upload !== (row.upload_column_id ?? AUTO_VALUE) ||
      d.receive !== (row.receive_column_id ?? AUTO_VALUE)
    );
  };

  const onSave = async (row: BoardDateMappingRow) => {
    const d = drafts[row.board_id];
    setSavingBoard(row.board_id);
    try {
      const result: SaveDateMappingResult = await saveBoardDateMapping({
        boardId: row.board_id,
        uploadColumnId: d.upload === AUTO_VALUE ? null : d.upload,
        receiveColumnId: d.receive === AUTO_VALUE ? null : d.receive,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not save mapping");
        return;
      }
      toast.success(`Saved date mapping for ${row.board_name}`);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save mapping");
    } finally {
      setSavingBoard(null);
    }
  };

  const grouped = rows.reduce<Record<string, BoardDateMappingRow[]>>((acc, r) => {
    const key = r.workspace_name ?? "No workspace";
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Skeleton.Base className="h-8 w-48" />
        <div className="mt-6 space-y-3">
          <Skeleton.Base className="h-20 w-full rounded-xl" />
          <Skeleton.Base className="h-20 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <ErrorState title="Could not load date mappings" message={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Date mappings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which column on each board holds the Upload date and the
          Received date. The Overview cards (Completed, Avg. turnaround, jobs
          table) all read the column selected here, so they stay in agreement.
          Leave a field on <em>Auto-detect</em> to use the column detected from
          its label.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="rounded-xl border-border p-6 text-sm text-muted-foreground">
          No active boards to map yet.
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([workspaceName, boards]) => (
            <section key={workspaceName} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {workspaceName}
              </h2>
              {boards.map((row) => {
                const d = drafts[row.board_id] ?? toDraft(row);
                const upBadge = sourceBadge(row.upload_source);
                const recvBadge = sourceBadge(row.receive_source);
                const dirty = isDirty(row);
                return (
                  <Card
                    key={row.board_id}
                    className="rounded-xl border-border p-4"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium text-foreground">
                          {row.board_name}
                        </p>
                        <Button
                          size="sm"
                          disabled={!dirty || savingBoard === row.board_id}
                          onClick={() => onSave(row)}
                        >
                          {savingBoard === row.board_id ? "Saving…" : "Save"}
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field
                          label="Upload date column"
                          badge={upBadge}
                          value={d.upload}
                          columns={row.columns}
                          onChange={(v) => setField(row.board_id, "upload", v)}
                        />
                        <Field
                          label="Received date column"
                          badge={recvBadge}
                          value={d.receive}
                          columns={row.columns}
                          onChange={(v) => setField(row.board_id, "receive", v)}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  badge,
  value,
  columns,
  onChange,
}: {
  label: string;
  badge: { label: string; className: string };
  value: string;
  columns: BoardDateMappingRow["columns"];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Auto-detect" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={AUTO_VALUE}>Auto-detect</SelectItem>
          {columns.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label || "(untitled)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}