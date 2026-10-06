"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MembersAccessModal } from "@/components/shared/members-access-modal";
import { cn } from "@/lib/utils";

/**
 * Board settings.
 *
 * Only the Members tab is implemented; General is a placeholder in the same
 * spirit as the disabled Permissions tab on /workspace. The Members tab is
 * hosted in its own dialog rather than inlined so the board toolbar's
 * "Members" entry and the workspace "Add members" entry can open the exact
 * same component.
 */

const TABS = [
  { id: "general", label: "General" },
  { id: "members", label: "Members" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export interface BoardSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  workspaceId: string;
  boardName: string;
  description?: string;
}

export function BoardSettingsDialog({
  open,
  onOpenChange,
  boardId,
  workspaceId,
  boardName,
  description,
}: BoardSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [membersOpen, setMembersOpen] = useState(false);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) setActiveTab("general");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="gap-0 bg-background p-0 sm:max-w-xl">
          <DialogHeader className="space-y-1 px-6 pt-6">
            <DialogTitle className="text-foreground">Board settings</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {boardName}
              {description ? ` — ${description}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-6 border-b border-border px-6" role="tablist" aria-label="Board settings">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "border-b-2 pb-2 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="max-h-[55vh] overflow-y-auto px-6 py-5">
            {activeTab === "general" && (
              <div
                role="tabpanel"
                className="flex flex-col items-center justify-center py-14 text-center"
              >
                <Lock
                  className="mb-3 size-10 text-muted-foreground/40"
                  aria-hidden="true"
                />
                <p className="text-sm text-muted-foreground">
                  General board settings are coming soon.
                </p>
              </div>
            )}

            {activeTab === "members" && (
              <div role="tabpanel" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Workspace members inherit their access to this board. Override
                  anyone&apos;s access here for this board only.
                </p>
                <Button variant="outline" className="w-full" onClick={() => setMembersOpen(true)}>
                  Manage members
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MembersAccessModal
        open={membersOpen}
        onOpenChange={setMembersOpen}
        scope={{ kind: "board", id: boardId }}
        workspaceId={workspaceId}
        subjectName={boardName}
      />
    </>
  );
}