"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LayoutTemplate, Folder, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Skeleton } from "@/components/shared/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

interface MyWorkRecord {
  record_id: string;
  title: string;
  column_matches: Array<{
    column_id: string;
    column_type: string;
    column_label: string;
    value_text: string;
    match_type: string;
  }>;
}

interface MyWorkBoard {
  board_id: string;
  board_name: string;
  board_slug: string | null;
  updated_at: string;
  records: MyWorkRecord[];
}

interface MyWorkWorkspace {
  workspace_id: string;
  workspace_name: string;
  boards: MyWorkBoard[];
}

export default function MyWorkPage() {
  const [data, setData] = useState<MyWorkWorkspace[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/my-work");
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const json: MyWorkWorkspace[] = await res.json();
      setData(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="space-y-8">
          <div className="space-y-2">
            <Skeleton.Base className="h-7 w-48" />
            <Skeleton.Base className="h-4 w-72" />
          </div>
          <div className="space-y-6">
            <Skeleton.Base className="h-5 w-40" />
            <Skeleton.TableRow cols={4} />
            <Skeleton.TableRow cols={4} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <ErrorState
          variant="inline"
          title="Failed to load My Work"
          message={error}
          onRetry={fetchData}
        />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <LayoutTemplate className="size-10 text-muted-foreground/40 mb-3" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Nothing assigned to you yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Boards where you're assigned in a person column or mentioned in a comment will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">My Work</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Records across boards where you are assigned or mentioned.
        </p>
      </div>

      <div className="space-y-8">
        {data.map((ws) => (
          <section key={ws.workspace_id} className="space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {ws.workspace_name}
            </h2>

            {ws.boards.map((board) => (
              <div key={board.board_id} className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <LayoutTemplate className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <Link
                    href={board.board_slug ? `/${board.board_slug}` : `/boards/${board.board_id}`}
                    className="truncate hover:underline"
                  >
                    {board.board_name}
                  </Link>
                  {board.updated_at && (
                    <span className="text-xs text-muted-foreground">
                      · Updated {formatDistanceToNow(new Date(board.updated_at), { addSuffix: true })}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {board.records.map((record) => (
                    <div
                      key={record.record_id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-accent/50"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{record.title || record.record_id}</span>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {record.column_matches.map((match) => (
                            <span
                              key={match.column_id}
                              className="inline-flex items-center gap-1 rounded-md bg-muted/30 px-2 py-0.5 text-xs"
                            >
                              <span className="font-medium">{match.column_label}:</span>
                              <span className="truncate">{match.value_text || "—"}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                      {record.column_matches.length > 0 && (
                        <span
                          className="ml-2 shrink-0 text-xs"
                          title={record.column_matches[0].match_type}
                        >
                          {record.column_matches[0].match_type === "mention" ? "@" : ""}
                          {record.column_matches[0].column_type === "person" ? "Assigned" : "Mentioned"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
