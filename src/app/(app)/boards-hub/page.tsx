"use client";

import { Fragment, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Unlock,
  Check,
  AlertCircle,
  Folder,
  LayoutTemplate,
  Clock,
  Shield,
  ShieldOff,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { Skeleton } from "@/components/shared/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { FavoriteStar } from "@/components/shared/favorite-star";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Board {
  id: string;
  name: string;
  board_url: string;
  created_at: string;
  created_by: string | null;
  is_restricted: boolean;
  allowed: boolean;
  requested: boolean;
  is_admin: boolean;
}

interface WorkspaceGroup {
  id: string;
  name: string;
  is_admin: boolean;
  boards: Board[];
}

export default function BoardsHubPage() {
  const router = useRouter();
  const [data, setData] = useState<WorkspaceGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestErrors, setRequestErrors] = useState<Map<string, string>>(new Map());
  const [restrictErrors, setRestrictErrors] = useState<Map<string, string>>(new Map());
  const { favoritedBoardIds, toggleBoardFavorite } = useWorkspace();
  const requestPending = useRef<Map<string, boolean>>(new Map());
  const restrictPending = useRef<Map<string, boolean>>(new Map());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/boards-hub");
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const json: WorkspaceGroup[] = await res.json();
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

  const handleRequestAccess = async (boardId: string) => {
    if (requestPending.current.get(boardId)) return;
    requestPending.current.set(boardId, true);

    try {
      const res = await fetch(`/api/boards/${boardId}/request-access`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Request failed");
      }
      setRequestErrors((prev) => {
        const next = new Map(prev);
        next.delete(boardId);
        return next;
      });
      setData((prev) =>
        prev?.map((ws) => ({
          ...ws,
          boards: ws.boards.map((b) =>
            b.id === boardId ? { ...b, requested: true } : b,
          ),
        })) ?? null,
      );
      toast.success("Access request sent to the workspace owner.");
    } catch {
      setRequestErrors((prev) => {
        const next = new Map(prev);
        next.set(boardId, "Couldn't send request, try again");
        return next;
      });
    } finally {
      requestPending.current.set(boardId, false);
    }
  };

  const handleToggleRestriction = async (boardId: string, currentlyRestricted: boolean) => {
    if (restrictPending.current.get(boardId)) return;
    restrictPending.current.set(boardId, true);

    try {
      const res = await fetch(`/api/boards/${boardId}/restrict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_restricted: !currentlyRestricted }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Request failed");
      }

      setRestrictErrors((prev) => {
        const next = new Map(prev);
        next.delete(boardId);
        return next;
      });

      const newRestricted = !currentlyRestricted;
      setData((prev) =>
        prev?.map((ws) => ({
          ...ws,
          boards: ws.boards.map((b) =>
            b.id === boardId ? { ...b, is_restricted: newRestricted } : b,
          ),
        })) ?? null,
      );

      toast.success(
        newRestricted
          ? "Board is now restricted. Only granted users can access it."
          : "Board is now open to all workspace members.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setRestrictErrors((prev) => {
        const next = new Map(prev);
        next.set(boardId, message);
        return next;
      });
    } finally {
      restrictPending.current.set(boardId, false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="space-y-8">
          <div className="space-y-2">
            <Skeleton.Base className="h-7 w-48" />
            <Skeleton.Base className="h-4 w-72" />
          </div>
          <div className="space-y-6">
            <Skeleton.Base className="h-5 w-40" />
            <Skeleton.TableRow cols={5} />
            <Skeleton.TableRow cols={5} />
            <Skeleton.TableRow cols={5} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <ErrorState
          variant="inline"
          title="Failed to load Boards hub"
          message={error}
          onRetry={fetchData}
        />
      </div>
    );
  }

  if (!data || data.length === 0 || data.every((ws) => ws.boards.length === 0)) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <LayoutTemplate className="size-10 text-muted-foreground/40 mb-3" aria-hidden="true" />
          <h2 className="text-lg font-semibold">No boards yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Boards from all workspaces will appear here.
          </p>
        </div>
      </div>
    );
  }

  const renderAccessCell = (board: Board) => {
    if (board.is_admin) {
      // Owner/admin: show restrict/unrestrict toggle
      const restrictError = restrictErrors.get(board.id);
      return (
        <div className="flex items-center gap-2">
          <Button
            variant={board.is_restricted ? "outline" : "ghost"}
            size="sm"
            className={cn(
              "h-7 px-2.5 text-xs",
              board.is_restricted
                ? "border-orange-200 text-orange-700 hover:bg-orange-50"
                : "text-muted-foreground",
            )}
            disabled={restrictPending.current.get(board.id)}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleRestriction(board.id, board.is_restricted);
            }}
          >
            {board.is_restricted ? (
              <>
                <ShieldOff className="size-3 mr-1" aria-hidden="true" />
                Restricted
              </>
            ) : (
              <>
                <Shield className="size-3 mr-1" aria-hidden="true" />
                Open
              </>
            )}
          </Button>
          {restrictError && (
            <AlertCircle className="size-3.5 text-red-600" aria-hidden="true" />
          )}
        </div>
      );
    }

    // Non-admin user
    if (!board.is_restricted) {
      // Open board — access granted
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200">
          Open access
        </Badge>
      );
    }

    // Restricted board
    if (board.requested) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
          <Check className="size-3" aria-hidden="true" />
          Requested
        </span>
      );
    }

    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-xs"
        disabled={requestPending.current.get(board.id)}
        onClick={(e) => {
          e.stopPropagation();
          handleRequestAccess(board.id);
        }}
      >
        Request access
      </Button>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-bold">Boards hub</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All workspaces and boards in one place.
            <span className="ml-2 text-xs">
              Boards are open by default. Restricted boards show a lock icon.
            </span>
          </p>
        </div>

        {data
          .filter((ws) => ws.boards.length > 0)
          .map((ws) => (
            <section key={ws.id} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {ws.name}
              </h2>

              <div className="overflow-hidden rounded-lg border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                     <thead>
                       <tr className="border-b border-border bg-muted/30">
                         <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                           Board
                         </th>
                         <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                           Starred
                         </th>
                         <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                           Built
                         </th>
                         <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                           Built by
                         </th>
                         <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                           Restriction
                         </th>
                         <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                           Access
                         </th>
                       </tr>
                     </thead>
                    <tbody>
                       {ws.boards.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                            No boards here yet.
                          </td>
                        </tr>
                      ) : (
                        ws.boards.map((board) => {
                          const isLocked = board.is_restricted && board.is_admin === false;
                          const createdDate = new Date(board.created_at);
                          const relativeTime = formatDistanceToNow(createdDate, {
                            addSuffix: true,
                          });
                          const requestError = requestErrors.get(board.id);

                          return (
                            <Fragment key={board.id}>
                              <tr
                                className={cn(
                                  "border-b border-border transition-colors",
                                  board.allowed
                                    ? "cursor-pointer hover:bg-accent/50"
                                    : "opacity-[0.55]",
                                  "last:border-b-0",
                                )}
                                onClick={() => {
                                  if (board.allowed && board.board_url) {
                                    router.push(`/${board.board_url}`);
                                  }
                                }}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    {isLocked && (
                                      <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                    )}
                                    <span className="truncate font-medium">{board.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <FavoriteStar
                                    itemId={board.id}
                                    itemType="board"
                                    isFavorited={favoritedBoardIds.has(board.id)}
                                    variant="default"
                                    onToggle={(favorited) => {
                                      toggleBoardFavorite(board.id, favorited);
                                    }}
                                  />
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                                    <span>{relativeTime}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {board.created_by ?? "—"}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {board.is_restricted ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                                      <Lock className="size-3" aria-hidden="true" />
                                      Restricted
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                                      <Unlock className="size-3" aria-hidden="true" />
                                      Open
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {renderAccessCell(board)}
                                </td>
                              </tr>
                              {requestError && (
                                <tr>
                                  <td colSpan={6} className="px-4 py-2">
                                    <div className="flex items-center gap-2 text-xs text-red-600">
                                      <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                                      {requestError}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}
