"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Globe,
  Lock,
  UserCheck,
  Search,
  Shield,
  Eye,
  EyeOff,
  CheckCircle2,
  Plus,
  ArrowRight,
  ArrowLeft,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnDefinition } from "../types";
import type { Member } from "@/lib/members-types";

export interface ColumnVisibilityConfig {
  mode: "everyone" | "staff_only" | "selected";
  allowedUserIds: string[];
  allowedEmails: string[];
}

interface ColumnAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  column: ColumnDefinition | null;
  members: Member[];
  onSave: (columnId: string, config: ColumnVisibilityConfig) => Promise<void> | void;
}

export function ColumnAccessModal({
  open,
  onOpenChange,
  column,
  members,
  onSave,
}: ColumnAccessModalProps) {
  const [mode, setMode] = useState<"everyone" | "staff_only" | "selected">("everyone");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [customEmailInput, setCustomEmailInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Initialize from column settings whenever the modal opens or column changes
  useEffect(() => {
    if (!column) return;
    const settings = (column.settings ?? {}) as Record<string, unknown>;
    const visibility = (settings.visibility ?? {}) as Partial<ColumnVisibilityConfig>;

    if (visibility.mode) {
      setMode(visibility.mode);
      setSelectedUserIds(new Set(visibility.allowedUserIds ?? []));
      setSelectedEmails(new Set((visibility.allowedEmails ?? []).map((e) => e.toLowerCase())));
    } else if (column.restrictView) {
      setMode("staff_only");
      setSelectedUserIds(new Set());
      setSelectedEmails(new Set());
    } else {
      setMode("everyone");
      setSelectedUserIds(new Set());
      setSelectedEmails(new Set());
    }
    setSearchQuery("");
    setCustomEmailInput("");
  }, [column, open]);

  // Determine visibility status for any member based on current mode and selections
  const isMemberPermitted = (member: Member): boolean => {
    if (mode === "everyone") return true;
    if (mode === "staff_only") {
      return member.role === "owner" || member.role === "edit";
    }
    if (mode === "selected") {
      if (member.role === "owner") return true; // Owners always have admin access
      const byId = selectedUserIds.has(member.user_id);
      const byEmail = member.email ? selectedEmails.has(member.email.toLowerCase()) : false;
      return Boolean(byId || byEmail);
    }
    return true;
  };

  // Group members into Visible To vs Hidden From
  const { visibleMembers, hiddenMembers } = useMemo(() => {
    const visible: Member[] = [];
    const hidden: Member[] = [];

    for (const m of members) {
      if (isMemberPermitted(m)) {
        visible.push(m);
      } else {
        hidden.push(m);
      }
    }
    return { visibleMembers: visible, hiddenMembers: hidden };
  }, [members, mode, selectedUserIds, selectedEmails]);

  // Filtered lists based on search query
  const q = searchQuery.toLowerCase().trim();
  const filteredVisible = useMemo(() => {
    if (!q) return visibleMembers;
    return visibleMembers.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.role?.toLowerCase().includes(q)
    );
  }, [visibleMembers, q]);

  const filteredHidden = useMemo(() => {
    if (!q) return hiddenMembers;
    return hiddenMembers.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.role?.toLowerCase().includes(q)
    );
  }, [hiddenMembers, q]);

  // Move member from Hidden to Visible list
  const handleGrantAccess = (member: Member) => {
    if (mode !== "selected") {
      // Switching from everyone / staff_only to selected mode pre-populates all existing visible members
      const nextUserIds = new Set<string>();
      const nextEmails = new Set<string>();
      visibleMembers.forEach((m) => {
        nextUserIds.add(m.user_id);
        if (m.email) nextEmails.add(m.email.toLowerCase());
      });
      nextUserIds.add(member.user_id);
      if (member.email) nextEmails.add(member.email.toLowerCase());
      setSelectedUserIds(nextUserIds);
      setSelectedEmails(nextEmails);
      setMode("selected");
      return;
    }
    setSelectedUserIds((prev) => new Set([...prev, member.user_id]));
    if (member.email) {
      setSelectedEmails((prev) => new Set([...prev, member.email.toLowerCase()]));
    }
  };

  // Move member from Visible to Hidden list
  const handleRevokeAccess = (member: Member) => {
    if (member.role === "owner") return; // Owners cannot be restricted

    if (mode !== "selected") {
      // Transition from everyone / staff_only to selected mode, keeping everyone EXCEPT this revoked user
      const nextUserIds = new Set<string>();
      const nextEmails = new Set<string>();
      visibleMembers.forEach((m) => {
        if (m.user_id !== member.user_id) {
          nextUserIds.add(m.user_id);
          if (m.email) nextEmails.add(m.email.toLowerCase());
        }
      });
      setSelectedUserIds(nextUserIds);
      setSelectedEmails(nextEmails);
      setMode("selected");
      return;
    }

    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      next.delete(member.user_id);
      return next;
    });
    if (member.email) {
      setSelectedEmails((prev) => {
        const next = new Set(prev);
        next.delete(member.email.toLowerCase());
        return next;
      });
    }
  };

  const handleAddCustomEmail = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = customEmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) return;

    if (mode !== "selected") {
      const nextUserIds = new Set<string>();
      const nextEmails = new Set<string>();
      visibleMembers.forEach((m) => {
        nextUserIds.add(m.user_id);
        if (m.email) nextEmails.add(m.email.toLowerCase());
      });
      nextEmails.add(cleanEmail);
      setSelectedUserIds(nextUserIds);
      setSelectedEmails(nextEmails);
      setMode("selected");
    } else {
      setSelectedEmails((prev) => new Set([...prev, cleanEmail]));
    }
    setCustomEmailInput("");
  };

  const handleRemoveCustomEmail = (email: string) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      next.delete(email.toLowerCase());
      return next;
    });
  };

  const handleSave = async () => {
    if (!column) return;
    setSaving(true);
    try {
      await onSave(column.id, {
        mode,
        allowedUserIds: Array.from(selectedUserIds),
        allowedEmails: Array.from(selectedEmails),
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const getMemberInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return "??";
  };

  if (!column) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden bg-background border-border">
        {/* ── Dialog Header ────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Shield className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-semibold">
                  Column Access & Permissions
                </DialogTitle>
                <Badge variant="secondary" className="text-xs font-normal">
                  {column.label}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Clearly view and control who can see this column and who is restricted.
              </DialogDescription>
            </div>
          </div>

          {/* Real-time status badges */}
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-700 dark:text-emerald-300">
              <Eye className="size-3.5" />
              {visibleMembers.length} Can View
            </span>
            <span className="flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-semibold text-red-700 dark:text-red-300">
              <EyeOff className="size-3.5" />
              {hiddenMembers.length} Hidden
            </span>
          </div>
        </div>

        {/* ── Main Body ────────────────────────────────────────────── */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Preset Rule Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Visibility Mode
              </label>
              <span className="text-[11px] text-muted-foreground">
                Choose a baseline rule or customize per login below
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Option 1: Everyone */}
              <button
                type="button"
                onClick={() => setMode("everyone")}
                className={cn(
                  "flex flex-col p-3 rounded-lg border text-left transition-all",
                  mode === "everyone"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-sm"
                    : "border-border hover:border-border/80 hover:bg-muted/30"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <Globe className="size-3.5 text-primary" />
                    <span>Visible to Everyone</span>
                  </div>
                  {mode === "everyone" && <CheckCircle2 className="size-3.5 text-primary" />}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  All studio staff and all client accounts can view this column.
                </p>
              </button>

              {/* Option 2: Internal Staff Only */}
              <button
                type="button"
                onClick={() => setMode("staff_only")}
                className={cn(
                  "flex flex-col p-3 rounded-lg border text-left transition-all",
                  mode === "staff_only"
                    ? "border-amber-500 bg-amber-500/5 ring-1 ring-amber-500/40 shadow-sm"
                    : "border-border hover:border-border/80 hover:bg-muted/30"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <Lock className="size-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Internal Staff Only</span>
                  </div>
                  {mode === "staff_only" && <CheckCircle2 className="size-3.5 text-amber-600" />}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Confidential. Visible to studio team; completely hidden from clients.
                </p>
              </button>

              {/* Option 3: Selected Logins Only */}
              <button
                type="button"
                onClick={() => {
                  if (mode !== "selected") {
                    const nextUserIds = new Set<string>();
                    const nextEmails = new Set<string>();
                    visibleMembers.forEach((m) => {
                      nextUserIds.add(m.user_id);
                      if (m.email) nextEmails.add(m.email.toLowerCase());
                    });
                    setSelectedUserIds(nextUserIds);
                    setSelectedEmails(nextEmails);
                    setMode("selected");
                  }
                }}
                className={cn(
                  "flex flex-col p-3 rounded-lg border text-left transition-all",
                  mode === "selected"
                    ? "border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/40 shadow-sm"
                    : "border-border hover:border-border/80 hover:bg-muted/30"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <UserCheck className="size-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Selected Logins Only</span>
                  </div>
                  {mode === "selected" && <CheckCircle2 className="size-3.5 text-blue-600" />}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Custom list of permitted logins. Move any account across lists.
                </p>
              </button>
            </div>
          </div>

          {/* Search bar for quick filtering */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search accounts across both lists by name, email, or role..."
              className="h-8 pl-9 text-xs bg-muted/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* ── Side-by-Side Dual Audit Grid ─────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ── LEFT COLUMN: 🟢 VISIBLE TO ─────────────────────────── */}
            <div className="flex flex-col rounded-xl border border-emerald-500/30 bg-emerald-500/[0.02] overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <Eye className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    Visible To ({visibleMembers.length})
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                  Can View
                </Badge>
              </div>

              <div className="p-2 text-[11px] text-muted-foreground bg-muted/10 border-b border-border/50">
                These accounts will see this column on their board:
              </div>

              <div className="p-2 divide-y divide-border/60 max-h-72 overflow-y-auto space-y-1">
                {filteredVisible.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    {members.length === 0
                      ? "No members in this board."
                      : "No visible accounts match your search."}
                  </div>
                ) : (
                  filteredVisible.map((member) => {
                    const isOwner = member.role === "owner";
                    const isStaff = member.role === "edit";
                    const isClient = member.role === "view";

                    return (
                      <div
                        key={member.user_id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 transition-colors gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar className="size-7 shrink-0 text-[10px]">
                            {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                            <AvatarFallback className="bg-emerald-500/15 text-emerald-700 font-semibold">
                              {getMemberInitials(member.name, member.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-foreground truncate">
                                {member.name || member.email}
                              </span>
                              {isOwner && (
                                <Badge variant="secondary" className="text-[9px] py-0 px-1 h-3.5">
                                  Owner
                                </Badge>
                              )}
                              {isStaff && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 h-3.5 text-emerald-600 border-emerald-300 bg-emerald-50/50">
                                  Staff
                                </Badge>
                              )}
                              {isClient && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 h-3.5 text-blue-600 border-blue-300 bg-blue-50/50">
                                  Client
                                </Badge>
                              )}
                            </div>
                            {member.name && member.email && (
                              <p className="text-[11px] text-muted-foreground truncate">{member.email}</p>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center">
                          {isOwner ? (
                            <span className="text-[10px] text-muted-foreground font-medium italic px-1">
                              Owner
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRevokeAccess(member)}
                              className="h-6 px-2 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-500/10 gap-1"
                              title="Hide this column from this user"
                            >
                              <span>Hide</span>
                              <ArrowRight className="size-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Additional Custom Allowed Emails */}
                {mode === "selected" && selectedEmails.size > 0 && (
                  <div className="pt-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                      Custom Client Emails:
                    </span>
                    <div className="space-y-1 mt-1">
                      {Array.from(selectedEmails).map((email) => (
                        <div
                          key={email}
                          className="flex items-center justify-between p-1.5 px-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs"
                        >
                          <span className="font-medium text-blue-700 dark:text-blue-300 truncate">
                            {email}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomEmail(email)}
                            className="text-muted-foreground hover:text-red-600 p-0.5"
                            title="Remove"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT COLUMN: 🔴 HIDDEN FROM ────────────────────────── */}
            <div className="flex flex-col rounded-xl border border-red-500/30 bg-red-500/[0.02] overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-red-500/10 border-b border-red-500/20">
                <div className="flex items-center gap-2">
                  <EyeOff className="size-4 text-red-600 dark:text-red-400" />
                  <span className="text-xs font-bold text-red-800 dark:text-red-300">
                    Hidden From ({hiddenMembers.length})
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30">
                  Restricted
                </Badge>
              </div>

              <div className="p-2 text-[11px] text-muted-foreground bg-muted/10 border-b border-border/50">
                These accounts CANNOT see this column on their screen:
              </div>

              <div className="p-2 divide-y divide-border/60 max-h-72 overflow-y-auto space-y-1">
                {filteredHidden.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground space-y-1.5">
                    <CheckCircle2 className="size-7 mx-auto text-emerald-500/60" />
                    <p className="font-medium text-foreground">No accounts are restricted</p>
                    <p className="text-[11px] text-muted-foreground">
                      This column is currently accessible to everyone on the board.
                    </p>
                  </div>
                ) : (
                  filteredHidden.map((member) => {
                    const isClient = member.role === "view";

                    return (
                      <div
                        key={member.user_id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 transition-colors gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar className="size-7 shrink-0 text-[10px]">
                            {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                            <AvatarFallback className="bg-red-500/15 text-red-700 font-semibold">
                              {getMemberInitials(member.name, member.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-foreground truncate">
                                {member.name || member.email}
                              </span>
                              {isClient ? (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 h-3.5 text-blue-600 border-blue-300 bg-blue-50/50">
                                  Client
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 h-3.5 text-emerald-600 border-emerald-300 bg-emerald-50/50">
                                  Staff
                                </Badge>
                              )}
                            </div>
                            {member.name && member.email && (
                              <p className="text-[11px] text-muted-foreground truncate">{member.email}</p>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleGrantAccess(member)}
                            className="h-6 px-2 text-[11px] text-emerald-600 border-emerald-400/40 hover:bg-emerald-500/10 gap-1"
                            title="Make this column visible to this user"
                          >
                            <ArrowLeft className="size-3" />
                            <span>Allow View</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Quick Grant by Client Email */}
          <form onSubmit={handleAddCustomEmail} className="flex items-center gap-2 pt-1">
            <Input
              value={customEmailInput}
              onChange={(e) => setCustomEmailInput(e.target.value)}
              placeholder="Grant view access to a specific client email (e.g. client@levis.com)..."
              className="h-8 text-xs bg-muted/10 flex-1"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!customEmailInput.includes("@")}
              className="h-8 text-xs gap-1.5 shrink-0"
            >
              <Plus className="size-3.5" />
              Allow Email
            </Button>
          </form>
        </div>

        {/* ── Dialog Footer ─────────────────────────────────────────── */}
        <DialogFooter className="border-t border-border/70 px-6 py-3 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {visibleMembers.length} can view
            </span>
            <span>•</span>
            <span className="font-semibold text-red-600 dark:text-red-400">
              {hiddenMembers.length} hidden
            </span>
            <span className="hidden md:inline text-muted-foreground/60">•</span>
            <span className="hidden md:inline text-muted-foreground/80">
              Test using the &ldquo;View as&rdquo; simulator in the board toolbar.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-8 text-xs gap-1.5 font-medium"
            >
              {saving ? "Saving..." : "Save Visibility Rules"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
