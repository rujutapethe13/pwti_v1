"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { JobLogRow } from "../types";
import { getStatusColor } from "../lib/colors";
import { formatDateShort } from "../lib/aggregation";

interface JobLogTableProps {
  rows: JobLogRow[];
  pageSize?: number;
}

type SortField = "client" | "jobType" | "batch" | "received" | "uploaded" | "skus" | "status";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 20;

export function JobLogTable({ rows, pageSize = PAGE_SIZE }: JobLogTableProps) {
  const [sortField, setSortField] = useState<SortField>("received");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(0);

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      const av = a[sortField] ?? "";
      const bv = b[sortField] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const paginatedRows = useMemo(
    () => sortedRows.slice(page * pageSize, (page + 1) * pageSize),
    [sortedRows, page, pageSize],
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setPage(0);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="size-3.5 opacity-40" />;
    return sortDirection === "asc"
      ? <ArrowUp className="size-3.5" />
      : <ArrowDown className="size-3.5" />;
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[50px]">S&nbsp;R.</TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("client")}
                  className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                >
                  Client <SortIcon field="client" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("jobType")}
                  className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                >
                  Job Type <SortIcon field="jobType" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("batch")}
                  className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                >
                  Batch <SortIcon field="batch" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("received")}
                  className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                >
                  Received <SortIcon field="received" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("uploaded")}
                  className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                >
                  Uploaded <SortIcon field="uploaded" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("skus")}
                  className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                >
                  SKUs <SortIcon field="skus" />
                </button>
              </TableHead>
              <TableHead className="min-w-[160px]">Comment</TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("status")}
                  className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                >
                  Status <SortIcon field="status" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
                  No jobs match the current filters
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row, idx) => {
                const sr = page * pageSize + idx + 1;
                const colors = getStatusColor(row.status);
                return (
                  <TableRow key={row.id} className="hover:bg-muted/50">
                    <TableCell className="text-xs text-muted-foreground">{sr}</TableCell>
                    <TableCell className="font-medium">{row.client}</TableCell>
                    <TableCell className="text-sm">{row.jobType}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">{row.batch}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateShort(row.received)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateShort(row.uploaded)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.skus.toLocaleString()}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{row.comment || "—"}</TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${colors.bg}40`,
                          color: colors.text,
                        }}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: colors.text }}
                        />
                        {row.status}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page + 1} of {totalPages} ({sortedRows.length} jobs)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-border px-2.5 py-1 text-xs disabled:opacity-50 hover:bg-muted"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded border border-border px-2.5 py-1 text-xs disabled:opacity-50 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
