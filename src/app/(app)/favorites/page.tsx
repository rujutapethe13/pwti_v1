import Link from "next/link";
import { Star, LayoutTemplate, Folder } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

interface FavoriteItem {
  id: string;
  item_type: "board" | "workspace";
  name: string;
  slug: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  created_at: string;
}

export const metadata = {
  title: "Favorites",
  description: "Your starred boards and workspaces.",
};

export default async function FavoritesPage() {
  const supabase = await createClient(await cookies());

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <EmptyState
            icon={Star}
            title="Sign in to see favorites"
            description="You need to be signed in to view and manage your favorite boards and workspaces."
            action={{ label: "Sign in", onClick: () => {} }}
          />
        </div>
      </div>
    );
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/favorites`, {
    next: { tags: ["favorites"] },
  });

  let favorites: FavoriteItem[] = [];
  if (res.ok) {
    favorites = (await res.json()) as FavoriteItem[];
  }

  const boards = favorites.filter((f) => f.item_type === "board");
  const workspaces = favorites.filter((f) => f.item_type === "workspace");

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Favorites</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Boards and workspaces you&apos;ve starred.
          </p>
        </div>

        {favorites.length === 0 ? (
          <EmptyState
            icon={Star}
            title="No favorites yet"
            description="Star boards and workspaces to quickly find them here."
            action={{ label: "Browse boards", onClick: () => {} }}
          />
        ) : (
          <div className="space-y-8">
            {workspaces.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Workspaces
                </h2>
                <ul className="space-y-1.5">
                  {workspaces.map((ws) => (
                    <li key={`ws-${ws.id}`}>
                      <Link
                        href="/workspace"
                        className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                      >
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                          <Folder className="size-4 text-muted-foreground" aria-hidden="true" />
                        </div>
                        <span className="flex-1 truncate font-medium">{ws.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {boards.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Boards
                </h2>
                <ul className="space-y-1.5">
                  {boards.map((board) => (
                    <li key={`board-${board.id}`}>
                      <Link
                        href={board.slug ? `/${board.slug}` : `/boards/${board.id}`}
                        className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                      >
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                          <LayoutTemplate className="size-4 text-muted-foreground" aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="block truncate font-medium">{board.name}</span>
                          {board.workspace_name && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {board.workspace_name}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
