"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/shared/status-pill";
import type { UnifiedJobRow } from "@/features/analytics/aggregation/types";

interface ClientSearchTableProps {
  rows: UnifiedJobRow[];
}

type SortField = "clientName" | "jobType" | "status" | "date" | "dueDate" | "assignedTo" | "boardName";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 25;

export function ClientSearchTable({ rows }: ClientSearchTableProps) {
  const router = useRouter();
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(0);

  // ── Sorting ────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "clientName":
          cmp = a.clientName.localeCompare(b.clientName);
          break;
        case "jobType":
          cmp = a.jobType.localeCompare(b.jobType);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "date":
          cmp = (a.date ?? "").localeCompare(b.date ?? "");
          break;
        case "dueDate":
          cmp = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
          break;
        case "assignedTo":
          cmp = a.assignedTo.join(", ").localeCompare(b.assignedTo.join(", "));
          break;
        case "boardName":
          cmp = a.boardName.localeCompare(b.boardName);
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, sortField, sortDirection]);

  // ── Pagination ─────────────────────────────────────────
  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);
  const paginatedRows = useMemo(
    () => sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [sortedRows, page],
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setPage(0);
  };

  const handleRowClick = (row: UnifiedJobRow) => {
    router.push(`/${row.boardId}`);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
    return sortDirection === "asc"
      ? <ArrowUp className="h-3.5 w-3.5" />
      : <ArrowDown className="h-3.5 w-3.5" />;
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[180px]">
                <button onClick={() => handleSort("clientName")} className="flex items-center gap-1 font-medium">
                  Client <SortIcon field="clientName" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort("jobType")} className="flex items-center gap-1 font-medium">
                  Job Type <SortIcon field="jobType" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort("status")} className="flex items-center gap-1 font-medium">
                  Status <SortIcon field="status" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort("date")} className="flex items-center gap-1 font-medium">
                  Date <SortIcon field="date" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort("dueDate")} className="flex items-center gap-1 font-medium">
                  Due Date <SortIcon field="dueDate" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort("assignedTo")} className="flex items-center gap-1 font-medium">
                  Assigned To <SortIcon field="assignedTo" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort("boardName")} className="flex items-center gap-1 font-medium">
                  Board <SortIcon field="boardName" />
                </button>
              </TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No jobs match the current filters
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleRowClick(row)}
                >
                  <TableCell className="font-medium">{row.clientName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {row.jobType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={mapToStatusKey(row.status)} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.date ? formatDate(row.date) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.dueDate ? formatDate(row.dueDate) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.assignedTo.length > 0 ? row.assignedTo.join(", ") : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.boardName}
                  </TableCell>
                  <TableCell>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page + 1} of {totalPages} ({sortedRows.length} total)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border px-3 py-1 text-xs disabled:opacity-50 hover:bg-muted"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded border px-3 py-1 text-xs disabled:opacity-50 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function mapToStatusKey(status: string): Parameters<typeof StatusPill>[0]["status"] {
  const statusLower = status.toLowerCase().trim();

  if (statusLower.includes("done") || statusLower.includes("complete") || statusLower.includes("delivered") || statusLower === "approved") {
    return "done";
  }
  if (statusLower.includes("progress") || statusLower === "editing" || statusLower === "rendering" || statusLower === "retouching" || statusLower === "working") {
    return "post-production";
  }
  if (statusLower === "review" || statusLower === "qc" || statusLower.includes("quality")) {
    return "qc";
  }
  if (statusLower.includes("queue") || statusLower.includes("not started") || statusLower.includes("todo") || statusLower.includes("backlog")) {
    return "not-started";
  }
  if (statusLower.includes("block") || statusLower.includes("delay") || statusLower.includes("hold") || statusLower.includes("stalled")) {
    return "delayed";
  }
  if (statusLower.includes("pre-prod") || statusLower.includes("pre production") || statusLower.includes("planning") || statusLower.includes("brief")) {
    return "pre-production";
  }
  if (statusLower.includes("post-prod") || statusLower.includes("post production")) {
    return "post-production";
  }

  return "not-started";
}
