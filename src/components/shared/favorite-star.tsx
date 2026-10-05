"use client";

import { useState, useCallback } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type FavoriteItemType = "board" | "workspace";

export interface FavoriteStarProps {
  itemId: string;
  itemType: FavoriteItemType;
  isFavorited?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "sidebar" | "topBar";
  onToggle?: (isFavorited: boolean) => void;
  className?: string;
}

/**
 * Reusable star toggle for board/workspace favorites.
 * Calls the /api/favorites endpoint with optimistic UI updates.
 *
 * Use `isFavorited` for server-init'd state, or let it manage state on its own.
 */
export function FavoriteStar({
  itemId,
  itemType,
  isFavorited,
  size = "md",
  variant = "default",
  onToggle,
  className,
}: FavoriteStarProps) {
  const [optimistic, setOptimistic] = useState<boolean | undefined>(isFavorited);

  const current = optimistic ?? isFavorited ?? false;

  const sizeClass = {
    sm: "size-3.5",
    md: "size-4",
    lg: "size-5",
  }[size];

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const next = !current;
      setOptimistic(next);
      onToggle?.(next);

      try {
        const res = next
          ? await fetch("/api/favorites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ item_type: itemType, item_id: itemId }),
            })
          : await fetch("/api/favorites", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ item_type: itemType, item_id: itemId }),
            });

        if (!res.ok) {
          throw new Error(`Failed to ${next ? "add" : "remove"} favorite`);
        }
      } catch (err) {
        setOptimistic(!next);
        onToggle?.(!next);
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    },
    [current, itemId, itemType, onToggle],
  );

  const variantClass = {
    default: cn(
      "flex items-center justify-center rounded hover:bg-accent",
      current ? "text-yellow-500" : "text-muted-foreground",
    ),
    sidebar: cn(
      "opacity-0 group-hover:opacity-100",
      current ? "text-yellow-500" : "text-muted-foreground",
    ),
    topBar: cn(
      "hover:bg-accent",
      current ? "text-yellow-500" : "text-muted-foreground",
    ),
  }[variant];

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={current ? "Unfavorite" : "Favorite"}
      className={cn(variantClass, className)}
    >
      <Star
        className={cn(sizeClass, current && "fill-current")}
        aria-hidden="true"
      />
    </button>
  );
}
