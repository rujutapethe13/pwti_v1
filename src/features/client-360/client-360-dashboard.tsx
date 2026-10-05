"use client";

import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Mail,
  ExternalLink,
  Search,
  Loader2,
  AlertCircle,
  Users,
  Briefcase,
  CalendarDays,
  Layers,
  ChevronDown,
  ChevronUp,
  FileText,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/shared/status-pill";
import { toast } from "sonner";
import { searchClient360Action } from "@/features/client-360/actions";
import { createClient360ItemAction } from "@/features/client-360/actions";
import type { Client360Match, Client360SearchResult } from "@/features/client-360/types";
import { formatDate } from "@/features/client-360/date-format";
import { Client360DailyActivityView } from "./daily-activity-view";

function mapStatusToPill(status: string): Parameters<typeof StatusPill>[0]["status"] {
  const s = status.toLowerCase().trim();
  if (s === "completed" || s.includes("done") || s.includes("complete") || s.includes("delivered") || s.includes("approved") || s.includes("finished") || s.includes("resolved") || s.includes("closed")) return "done";
  if (s === "in progress" || s.includes("progress") || s.includes("active") || s.includes("queued") || s.includes("started")) return "post-production";
  if (s === "qa" || s.includes("qa") || s.includes("testing")) return "qc";
  if (s === "review" || s.includes("review")) return "approval-pending";
  if (s === "overdue" || s.includes("overdue") || s.includes("blocked") || s.includes("stuck") || s.includes("delayed") || s.includes("at risk")) return "delayed";
  if (s === "not started" || s.includes("not started") || s.includes("pending") || s.includes("todo") || s.includes("backlog")) return "not-started";
  return "not-started";
}

const PAGE_SIZE = 1000;

interface Client360DashboardProps {
  initialQuery: string;
  initialData?: {
    workspaces: Array<{ id: string; name: string }>;
    boards: Array<{ id: string; name: string; slug: string; workspaceId: string }>;
    clientColumns: Array<{ boardId: string; boardName: string; columnId: string; columnLabel: string; clientType?: string }>;
  };
}

export function Client360Dashboard({ initialQuery, initialData }: Client360DashboardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Client360SearchResult | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addBoardId, setAddBoardId] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"dashboard" | "daily-activity">("dashboard");

  const search = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await searchClient360Action(query.trim(), {
        page: 1,
        pageSize: PAGE_SIZE,
      });
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setResult(res.data);
      }
    } catch {
      setError("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery) {
      search(initialQuery);
    }
  }, [initialQuery, search]);

  const matches = useMemo(() => result?.matches ?? [], [result]);

  const clientName = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of matches) {
      counts.set(m.clientName, (counts.get(m.clientName) ?? 0) + 1);
    }
    let best = "";
    let max = 0;
    for (const [name, count] of counts) {
      if (count > max) {
        max = count;
        best = name;
      }
    }
    return best || matches[0]?.clientName || "";
  }, [matches]);

  const initials = useMemo(() => {
    return clientName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }, [clientName]);

  const allAssignees = useMemo(() => {
    const personCounts = new Map<string, { name: string; email?: string; count: number }>();
    for (const m of matches) {
      for (const p of m.assignedTo) {
        const key = p.name.toLowerCase();
        const existing = personCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          personCounts.set(key, { name: p.name, email: p.email, count: 1 });
        }
      }
    }
    return Array.from(personCounts.values()).sort((a, b) => b.count - a.count);
  }, [matches]);

  const timelineData = useMemo(() => {
    const sorted = [...matches].sort(
      (a, b) => new Date(a.date || a.createdAt).getTime() - new Date(b.date || b.createdAt).getTime(),
    );
    const groups: Array<{
      key: string;
      workspaceName: string;
      boardName: string;
      months: Array<{
        label: string;
        items: Client360Match[];
      }>;
    }> = [];
    for (const m of sorted) {
      const key = `${m.workspaceId}::${m.boardId}`;
      let group = groups.find((g) => g.key === key);
      if (!group) {
        group = { key, workspaceName: m.workspaceName, boardName: m.boardName, months: [] };
        groups.push(group);
      }
      const dateVal = m.date || m.createdAt;
      const dateObj = new Date(dateVal);
      const monthLabel = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}`;
      let month = group.months.find((mo) => mo.label === monthLabel);
      if (!month) {
        month = { label: monthLabel, items: [] };
        group.months.push(month);
      }
      month.items.push(m);
    }
    return groups;
  }, [matches]);

  const statusBreakdown = useMemo(() => {
    const buckets = result?.statusBuckets ?? {};
    return Object.entries(buckets).sort(([, a], [, b]) => (b as number) - (a as number));
  }, [result]);

  const jobTypeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of matches) {
      const jt = m.jobType || "Unspecified";
      counts.set(jt, (counts.get(jt) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(([, a], [, b]) => b - a);
  }, [matches]);

  const linkedItems = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{ boardId: string; boardSlug: string; boardName: string; itemId: string; itemTitle: string; workspaceName: string }> = [];
    for (const m of matches) {
      for (const li of m.linkedItems) {
        const key = `${li.boardId}:${li.itemId}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push(li);
        }
      }
    }
    return items;
  }, [matches]);

  const files = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ name: string; url?: string; boardId: string; recordId: string }> = [];
    for (const m of matches) {
      for (const f of m.files) {
        const key = `${f.boardId}:${f.recordId}:${f.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(f);
        }
      }
    }
    return result;
  }, [matches]);

  const handleAddItem = async () => {
    if (!addBoardId || !addTitle.trim() || !clientName.trim()) {
      toast.error("Title and client name are required");
      return;
    }
    setAddLoading(true);
    try {
      const res = await createClient360ItemAction({
        boardId: addBoardId,
        title: addTitle.trim(),
        clientName: clientName.trim(),
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Item created successfully");
        setShowAddDialog(false);
        setAddBoardId("");
        setAddTitle("");
        if (clientName.trim()) {
          await search(clientName.trim());
        }
      }
    } catch {
      toast.error("Failed to create item");
    } finally {
      setAddLoading(false);
    }
  };

  const handleMessageAssignee = (person: { name: string; email?: string }) => {
    if (person.email) {
      window.location.href = `mailto:${person.email}`;
    } else {
      toast.info(`No email on file for ${person.name}`);
    }
  };

  const handleJumpToBoard = (boardId: string, boardSlug: string) => {
    router.push(`/${boardSlug || boardId}`);
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const boardOptions = useMemo(() => {
    if (!initialData?.boards) return [];
    return initialData.boards;
  }, [initialData]);

  return (
    <div className="space-y-6">
      {/* ── Client Header ───────────────────────────── */}
      {clientName && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg font-bold">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold">{clientName}</h2>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Primary Assignees:</span>
                  {allAssignees.slice(0, 5).map((person) => (
                    <button
                      key={person.name}
                      onClick={() => handleMessageAssignee(person)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium hover:bg-accent/80 transition-colors"
                      title={person.email ? `Email ${person.email}` : `No email for ${person.name}`}
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[8px]">
                          {person.name.split(/\s+/).map((w) => w[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      {person.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {statusBreakdown.map(([status, count]) => (
                  <Badge key={status} variant="secondary" className="text-xs">
                    {status}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── View Mode Tabs ────────────────────────────── */}
      {!loading && !error && result && result.totalItems > 0 && (
        <div className="flex items-center gap-1 border-b border-border">
          <button
            type="button"
            onClick={() => setViewMode("dashboard")}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              viewMode === "dashboard"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Briefcase className="size-4" />
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setViewMode("daily-activity")}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              viewMode === "daily-activity"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CalendarDays className="size-4" />
            Daily Activity
          </button>
        </div>
      )}

      {/* ── Loading ─────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Error ───────────────────────────────────── */}
      {!loading && error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mb-3" />
            <h3 className="text-base font-medium">Search failed</h3>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1"
              onClick={() => initialQuery && search(initialQuery)}
            >
              <Search className="size-3.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Empty ───────────────────────────────────── */}
      {!loading && !error && result && result.totalItems === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="mx-auto size-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-medium">No results found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              No client matching &ldquo;{result.query}&rdquo; was found.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Dashboard Content ───────────────────────── */}
      {!loading && !error && result && result.totalItems > 0 && (
        <>
          {viewMode === "dashboard" ? (
            <>
              {/* Summary Cards Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <Briefcase className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Total Jobs</p>
                  <p className="text-lg font-semibold">{result.totalItems}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <Layers className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Workspaces</p>
                  <p className="text-lg font-semibold">{result.workspacesMatched.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">People</p>
                  <p className="text-lg font-semibold">{allAssignees.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <CalendarDays className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Linked Items</p>
                  <p className="text-lg font-semibold">{linkedItems.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Status Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {statusBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No status data</p>
                ) : (
                  statusBreakdown.map(([status, count]) => {
                    const pillStatus = mapStatusToPill(status);
                    return (
                      <div key={status} className="flex items-center justify-between">
                        <StatusPill status={pillStatus} />
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Job Type Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Job Type Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {jobTypeBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No job type data</p>
                ) : (
                  jobTypeBreakdown.map(([jobType, count]) => (
                    <div key={jobType} className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">{jobType}</Badge>
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* People Involved */}
          {allAssignees.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">People Involved</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {allAssignees.map((person) => (
                    <div key={person.name} className="flex items-center justify-between">
                      <button
                        onClick={() => handleMessageAssignee(person)}
                        className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity"
                      >
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[10px]">
                            {person.name.split(/\s+/).map((w) => w[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{person.name}</span>
                        {person.email && (
                          <Mail className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                      <Badge variant="secondary">{person.count} task{person.count !== 1 ? "s" : ""}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="default" size="sm" className="gap-1" onClick={() => setShowAddDialog(true)}>
              <Plus className="size-3.5" />
              Add Item
            </Button>
            <span className="text-xs text-muted-foreground ml-1">Quick Actions:</span>
          </div>

          {/* Linked Items & Files */}
          {(linkedItems.length > 0 || files.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {linkedItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Linked Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {linkedItems.map((item) => (
                        <div key={`${item.boardId}:${item.itemId}`} className="flex items-center justify-between rounded-md border px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{item.itemTitle}</p>
                            <p className="text-xs text-muted-foreground">{item.boardName}</p>
                          </div>
                          <button
                            onClick={() => handleJumpToBoard(item.boardId, item.boardSlug)}
                            className="shrink-0 text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            Open <ExternalLink className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {files.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Files</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {files.map((file, idx) => (
                        <div key={`${file.boardId}:${file.recordId}:${file.name}:${idx}`} className="flex items-center gap-2 rounded-md border px-3 py-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate flex-1">{file.name}</span>
                          {file.url && (
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0"
                            >
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {timelineData.map((group) => (
                  <div key={group.key}>
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="flex items-center gap-2 w-full text-left mb-2"
                    >
                      {expandedGroups.has(group.key) ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-semibold">{group.workspaceName}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{group.boardName}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {group.months.reduce((sum, mo) => sum + mo.items.length, 0)}
                      </Badge>
                    </button>
                    {expandedGroups.has(group.key) && (
                      <div className="ml-6 space-y-3 border-l border-border pl-4">
                        {group.months.map((month) => (
                          <div key={month.label}>
                            <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                              {month.label}
                            </p>
                            <div className="space-y-2">
                              {month.items.map((match, idx) => {
                                const pillStatus = mapStatusToPill(match.statusBucket);
                                return (
                                  <div
                                    key={`${match.recordId}-${idx}`}
                                    className="flex items-start gap-3 rounded-md border px-3 py-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className="text-sm font-medium">{match.recordTitle}</span>
                                        {pillStatus && <StatusPill status={pillStatus} />}
                                      </div>
                                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                        <span className="flex items-center gap-0.5">
                                          <CalendarDays className="h-3 w-3" />
                                          {formatDate(match.date) || "—"}
                                        </span>
                                        <Badge variant="outline" className="text-[10px]">{match.jobType}</Badge>
                                        <span className="flex items-center gap-0.5">
                                          <Layers className="h-3 w-3" />
                                          {match.groupName}
                                        </span>
                                        <span className="flex items-center gap-0.5">
                                          <Users className="h-3 w-3" />
                                          {match.assignedTo.length > 0
                                            ? match.assignedTo.map((a) => a.name).join(", ")
                                            : "—"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        onClick={() => handleJumpToBoard(match.boardId, match.boardSlug)}
                                        className="p-1 rounded hover:bg-accent"
                                        title="Jump to board"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
            </>
          ) : (
            <Client360DailyActivityView clientId={matches[0]?.clientId || ""} />
          )}
        </>
      )}

      {/* ── Add Item Dialog ─────────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Item</DialogTitle>
            <DialogDescription>
              Create a new item for {clientName || "this client"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Board</label>
              <Select value={addBoardId} onValueChange={setAddBoardId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a board" />
                </SelectTrigger>
                <SelectContent>
                  {boardOptions.map((board) => (
                    <SelectItem key={board.id} value={board.id}>
                      {board.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="Item title"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddItem} disabled={addLoading}>
              {addLoading && <Loader2 className="size-3.5 animate-spin" />}
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
