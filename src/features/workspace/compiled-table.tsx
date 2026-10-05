"use client";

import { useMemo, useState } from "react";
import {
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  EyeOff,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  FileSpreadsheet,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";

interface CompiledRow {
  id: string;
  name: string;
  type: string;
  status: string;
  lastModified: string;
  board: string;
}

const MOCK_ROWS: CompiledRow[] = [
  { id: "1", name: "Project Alpha", type: "Board", status: "Active", lastModified: "2026-09-08", board: "Production" },
  { id: "2", name: "Q3 Campaign", type: "Dashboard", status: "Draft", lastModified: "2026-09-05", board: "Marketing" },
  { id: "3", name: "Asset Library", type: "Folder", status: "Active", lastModified: "2026-09-01", board: "Design" },
  { id: "4", name: "Vendor List", type: "Board", status: "Active", lastModified: "2026-08-28", board: "Procurement" },
  { id: "5", name: "Budget Tracker", type: "Dashboard", status: "Active", lastModified: "2026-08-22", board: "Finance" },
];

export function CompiledTable() {
  const { activeWorkspace } = useWorkspace();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof CompiledRow>("lastModified");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MOCK_ROWS.filter((r) => !q || r.name.toLowerCase().includes(q) || r.board.toLowerCase().includes(q));
  }, [search]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const av = String(a[sortField] ?? "");
      const bv = String(b[sortField] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filteredRows, sortField, sortDir]);

  const handleSort = (field: keyof CompiledRow) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: keyof CompiledRow }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 inline size-3 opacity-40" aria-hidden="true" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 inline size-3" aria-hidden="true" />
    ) : (
      <ArrowDown className="ml-1 inline size-3" aria-hidden="true" />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search compiled..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full pl-8 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Filter className="size-3.5" aria-hidden="true" />
          Filters
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>
                <button onClick={() => handleSort("name")} className="flex items-center font-medium">
                  Name <SortIcon field="name" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort("type")} className="flex items-center font-medium">
                  Type <SortIcon field="type" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort("status")} className="flex items-center font-medium">
                  Status <SortIcon field="status" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort("board")} className="flex items-center font-medium">
                  Board <SortIcon field="board" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort("lastModified")} className="flex items-center font-medium">
                  Last Modified <SortIcon field="lastModified" />
                </button>
              </TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No compiled items match your search.
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      <LayoutGrid className="size-4 text-muted-foreground" aria-hidden="true" />
                      {row.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {row.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === "Active" ? "default" : "secondary"} className="text-xs">
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.board}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.lastModified}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="size-8" aria-label="Open">
                      <Plus className="size-3.5 rotate-45" aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}