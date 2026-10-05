"use client";

import { useMemo } from "react";
import { Plus, Search, Settings2, LayoutGrid, Pencil, Trash2, Star, Archive, ArrowUpDown } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useWorkspace, type ContentItem } from "@/lib/workspace-context";

function ItemIcon({ item }: { item: ContentItem }) {
  const iconMap: Record<string, typeof Settings2> = {
    Settings2,
    LayoutGrid,
    Pencil,
    Star,
    Archive,
    ArrowUpDown,
  };
  const Icon = item.icon ? (iconMap[item.icon] ?? LayoutGrid) : LayoutGrid;
  return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

export function ManageWorkspaceTable() {
  const { activeWorkspace, updateBoardFavorite } = useWorkspace();
  const content = activeWorkspace?.content ?? [];

  const sortedContent = useMemo(
    () => [...content].sort((a, b) => a.name.localeCompare(b.name)),
    [content],
  );

  if (content.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border py-16 text-center">
        <LayoutGrid className="size-12 text-muted-foreground/40 mb-3" aria-hidden="true" />
        <h3 className="text-sm font-medium text-muted-foreground">No content yet</h3>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Add boards or docs to get started.
        </p>
        <Button size="sm" className="mt-4 gap-1.5">
          <Plus className="size-3.5" aria-hidden="true" />
          Add content
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search content..."
            className="h-9 w-full pl-8 text-sm"
          />
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-3.5" aria-hidden="true" />
          Add
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[200px]">Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="w-[60px] text-center">Favorite</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedContent.map((item) => (
              <TableRow key={item.id} className="hover:bg-muted/50">
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <ItemIcon item={item} />
                    <span className="font-medium">{item.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs capitalize">
                    {item.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {item.slug ?? "—"}
                </TableCell>
                <TableCell className="text-center">
                  {item.type === "board" && (
                    <button
                      onClick={() => updateBoardFavorite(item.id, !item.isFavorite)}
                      className={cn(
                        "flex size-6 items-center justify-center rounded hover:bg-accent mx-auto",
                        item.isFavorite ? "text-yellow-500" : "text-muted-foreground",
                      )}
                      aria-label={item.isFavorite ? "Unfavorite" : "Favorite"}
                    >
                      <Star className={cn("size-4", item.isFavorite && "fill-current")} aria-hidden="true" />
                    </button>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="size-8" aria-label="Rename">
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8" aria-label="Archive">
                      <Archive className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8" aria-label="Delete">
                      <Trash2 className="size-3.5 text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}