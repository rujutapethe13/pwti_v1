"use client";

import * as ReactDOM from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { formatDistanceToNowStrict, format } from "date-fns";
import { Check, Clock, Loader2, Mail, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/features/boards/engine/components/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  ACCESS_OPTIONS,
  accessRoleLabel,
  isValidEmail,
  type GrantableAccess,
  type Member,
  type MemberCandidate,
  type PendingInvite,
} from "@/lib/members-types";
import {
  addMember,
  cancelInvite,
  clearBoardOverride,
  invalidateScope,
  removeMember,
  resendInvite,
  searchMemberCandidates,
  setMemberAccess,
  useScopeAccess,
} from "@/lib/members-client";

/**
 * "Members & access" — one modal for both scopes.
 *
 * The rows are the same shape either way; only the query and the meaning of
 * "Remove" differ. Workspace scope edits `workspace_members`, which is what
 * `can_edit_workspace` and the RLS on records / cell_values / views / groups
 * already authorize on. Board scope writes a `board_member_overrides` row that
 * wins over the workspace role for that board alone, and its absence is what the
 * "Inherited from workspace" label reports.
 *
 * Who can do what is not decided here. `useScopeAccess` asks the API, which asks
 * `can_manage_members`; a view user gets the list with every control disabled.
 */

type Scope = { kind: "workspace"; id: string } | { kind: "board"; id: string };

interface MembersAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: Scope | null;
  /** Shown under the title, e.g. "Production" or the workspace name. */
  subjectName?: string;
  /** Required for board scope, and used to re-scope after a write. */
  workspaceId?: string;
  /** Called after a successful add/remove/clear so the parent can refresh. */
  onMembersChanged?: () => Promise<void> | void;
}

/** A heartbeat lands at most once a minute; two is a comfortable online window. */
const ONLINE_WINDOW_MS = 2 * 60_000;

type PendingAction =
  | { kind: "remove"; member: Member }
  | { kind: "clear"; member: Member }
  | { kind: "cancel"; invite: PendingInvite };

/**
 * Local rather than imported: `user-context` is mid-refactor and the shared
 * `userInitials` helper is not settled. Two lines are cheaper than coupling the
 * Members modal to it.
 */
function initialsOf(name: string, email: string): string {
  const parts = (name?.trim() || email || "?").split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function MemberSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2" aria-hidden="true">
      <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-44 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

export function MembersAccessModal({
  open,
  onOpenChange,
  scope,
  subjectName,
  workspaceId,
  onMembersChanged,
}: MembersAccessModalProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const kind = scope?.kind ?? "workspace";
  const scopedId = scope?.id ?? "";
  const boardId = kind === "board" ? scopedId : null;

  const {
    loading,
    error: loadError,
    canManageMembers,
    members,
    pendingInvites,
  } = useScopeAccess(kind, workspaceId || null, boardId);

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<MemberCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [access, setAccess] = useState<GrantableAccess>("edit");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [working, setWorking] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const inputId = useId();
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const takenEmails = useMemo(() => {
    const set = new Set(members.map((member) => member.email.toLowerCase()));
    for (const invite of pendingInvites) set.add(invite.email.toLowerCase());
    return set;
  }, [members, pendingInvites]);

  const typedEmail = query.trim().toLowerCase();
  const canInviteByEmail = isValidEmail(typedEmail) && !takenEmails.has(typedEmail);
  const isDuplicate = typedEmail.length > 0 && takenEmails.has(typedEmail);

  // Reset the form when the modal closes so a half-typed address does not
  // reappear next time.
  useEffect(() => {
    if (open) return;
    setQuery("");
    setCandidates([]);
    setSuggestionsOpen(false);
    setFormError(null);
  }, [open]);

  // Autocomplete. Owner and edit only — a view user has nothing to add.
  useEffect(() => {
    if (!open || !canManageMembers || !workspaceId) return;

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setCandidates([]);
      setSuggestionsOpen(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const timer = setTimeout(() => {
      searchMemberCandidates(kind, workspaceId, boardId, trimmed)
        .then((results) => {
          if (cancelled) return;
          setCandidates(results);
          setHighlighted(0);
          setSuggestionsOpen(true);
        })
        .catch(() => {
          if (!cancelled) setCandidates([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, workspaceId, kind, boardId, canManageMembers]);

  useEffect(() => {
    if (!suggestionsOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const listbox = document.getElementById(listboxId);
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(target) &&
        listbox &&
        !listbox.contains(target)
      ) {
        setSuggestionsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [suggestionsOpen, listboxId]);

  const refresh = useCallback(() => {
    if (workspaceId) invalidateScope(kind, workspaceId, boardId);
  }, [kind, workspaceId, boardId]);

  const submit = useCallback(
    async (emailOverride?: string) => {
      const email = (emailOverride ?? query).trim().toLowerCase();

      if (!canManageMembers) {
        setFormError("You need edit access to add members.");
        return;
      }
      if (!email) {
        setFormError("Enter a name or email address.");
        return;
      }
      if (!isValidEmail(email)) {
        setFormError(`"${email}" is not a valid email address.`);
        return;
      }
      if (takenEmails.has(email)) {
        setFormError("That person already has access.");
        return;
      }

      setSubmitting(true);
      setFormError(null);
      try {
        const result = await addMember({
          scope: kind,
          workspaceId: workspaceId ?? "",
          boardId,
          email,
          access,
        });
        toast.success(
          result.invited ? `Invite sent to ${email}` : `${email} added`,
        );
        setQuery("");
        setCandidates([]);
        setSuggestionsOpen(false);
        refresh();
        onMembersChanged?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not add that member.";
        setFormError(message);
        toast.error(message);
      } finally {
        setSubmitting(false);
      }
    },
    [access, boardId, canManageMembers, kind, query, refresh, takenEmails, workspaceId, onMembersChanged],
  );

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      // Close the suggestion list first; a second Escape reaches the Dialog.
      if (suggestionsOpen) {
        event.stopPropagation();
        setSuggestionsOpen(false);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (suggestionsOpen && candidates.length > 0 && !canInviteByEmail) {
        const candidate = candidates[Math.min(highlighted, candidates.length - 1)];
        if (candidate) {
          void submit(candidate.email);
          return;
        }
      }
      void submit();
      return;
    }

    if (!suggestionsOpen || candidates.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % candidates.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + candidates.length) % candidates.length);
    }
  };

  const handleChangeAccess = useCallback(
    async (member: Member, next: GrantableAccess) => {
      if (member.role === next) return;

      setBusyUserId(member.user_id);
      setMemberAccess({
        scope: kind,
        workspaceId: workspaceId ?? "",
        boardId,
        userId: member.user_id,
        access: next,
      })
        .then(() => {
          toast.success("Access updated");
          refresh();
          onMembersChanged?.();
        })
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Could not update access.");
        })
        .finally(() => setBusyUserId(null));
    },
    [boardId, kind, refresh, workspaceId, onMembersChanged],
  );

  const handleResend = useCallback(
    async (invite: PendingInvite) => {
      setBusyUserId(invite.code);
      resendInvite(workspaceId ?? "", invite.code)
        .then(() => {
          toast.success(`Invite resent to ${invite.email}`);
          refresh();
          onMembersChanged?.();
        })
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Could not resend that invite.");
        })
        .finally(() => setBusyUserId(null));
    },
    [refresh, workspaceId, onMembersChanged],
  );

  const confirmPending = useCallback(async () => {
    if (!pendingAction || !workspaceId) return;

    setWorking(true);
    try {
      if (pendingAction.kind === "cancel") {
        await cancelInvite(workspaceId, pendingAction.invite.code);
        toast.success(`Invite to ${pendingAction.invite.email} cancelled`);
      } else if (pendingAction.kind === "clear") {
        await clearBoardOverride({
          workspaceId,
          boardId: boardId ?? "",
          userId: pendingAction.member.user_id,
        });
        toast.success(`${pendingAction.member.name} now follows the workspace`);
      } else {
        await removeMember({
          scope: kind,
          workspaceId,
          boardId,
          userId: pendingAction.member.user_id,
        });
        toast.success(`${pendingAction.member.name} removed`);
      }
      setPendingAction(null);
      refresh();
      onMembersChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete that change.");
    } finally {
      setWorking(false);
    }
  }, [boardId, kind, onMembersChanged, pendingAction, refresh, workspaceId]);

  const showSuggestions =
    suggestionsOpen && canManageMembers && typedEmail.length > 0 && !submitting;

  const isBoard = kind === "board";

  const confirmCopy = (() => {
    if (!pendingAction) return { title: "", description: "", confirm: "Remove" };
    if (pendingAction.kind === "cancel") {
      return {
        title: `Cancel the invite to ${pendingAction.invite.email}?`,
        description: "They will no longer see an invitation to join.",
        confirm: "Cancel invite",
      };
    }
    if (pendingAction.kind === "clear") {
      return {
        title: `Reset ${pendingAction.member.name} to the workspace role?`,
        description:
          "Their board-specific access is removed and the workspace role applies again.",
        confirm: "Reset access",
      };
    }
    return isBoard
      ? {
          title: `Remove ${pendingAction.member.name} from this board?`,
          description:
            "They lose access to this board. Access to other boards in the workspace is unchanged.",
          confirm: "Remove",
        }
      : {
          title: `Remove ${pendingAction.member.name}?`,
          description:
            "They lose access to this workspace and every board inside it.",
          confirm: "Remove",
        };
  })();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] gap-0 bg-background p-0 sm:max-w-lg">
          <DialogHeader className="space-y-1 px-6 pt-6">
            <DialogTitle className="text-foreground">Members</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {subjectName
                ? isBoard
                  ? `Who can access ${subjectName}`
                  : `Who can access ${subjectName} and its boards`
                : "Who has access"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
            {/* ── Add members ─────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div ref={wrapperRef} className="relative w-full sm:flex-1">
                  <label htmlFor={inputId} className="sr-only">
                    Add members by name or email
                  </label>
                  <Input
                    id={inputId}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={handleInputKeyDown}
                    onFocus={() => {
                      if (candidates.length > 0) setSuggestionsOpen(true);
                    }}
                    placeholder="Add members by name or email"
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={showSuggestions}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={
                      showSuggestions && candidates[highlighted]
                        ? `${listboxId}-option-${highlighted}`
                        : undefined
                    }
                    disabled={!canManageMembers || submitting}
                    className="text-sm"
                  />

                  {showSuggestions && wrapperRef.current && (
                    ReactDOM.createPortal(
                      <ul
                        id={listboxId}
                        role="listbox"
                        aria-label="Matching people"
                        className="fixed z-[10000] max-h-56 overflow-y-auto rounded-[8px] p-[4px]"
                        style={{
                          left: wrapperRef.current.getBoundingClientRect().left,
                          top: wrapperRef.current.getBoundingClientRect().bottom + 4,
                          width: wrapperRef.current.getBoundingClientRect().width,
                          backgroundColor: isDark ? "#1f1f23" : "#ffffff",
                          border: `1px solid ${isDark ? "#3a3a40" : "#e5e5e5"}`,
                          boxShadow: isDark
                            ? "0 8px 24px rgba(0,0,0,0.4)"
                            : "0 8px 24px rgba(0,0,0,0.2)",
                          color: isDark ? "#ffffff" : "#1a1a2e",
                        }}
                      >
                        {searching && candidates.length === 0 && (
                          <li className="px-2 py-1.5 text-xs text-muted-foreground">Searching…</li>
                        )}

                        {!searching && candidates.length === 0 && canInviteByEmail && (
                          <li
                            id={`${listboxId}-option-invite`}
                            role="option"
                            aria-selected
                            onMouseDown={(event) => {
                              event.preventDefault();
                              void submit(typedEmail);
                            }}
                            className="flex cursor-pointer items-center gap-2 rounded-sm px-[12px] py-[8px] text-sm"
                            style={{
                              backgroundColor: "transparent",
                            }}
                          >
                            <Mail
                              className="size-3.5 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 truncate">
                              Invite by email
                              <span className="block truncate text-xs text-muted-foreground">
                                {typedEmail}
                              </span>
                            </span>
                          </li>
                        )}

                        {!searching && candidates.length === 0 && !canInviteByEmail && (
                          <li className="px-2 py-1.5 text-xs text-muted-foreground">
                            {isDuplicate
                              ? "That person already has access."
                              : "No matching people."}
                          </li>
                        )}

                        {candidates.map((candidate, index) => (
                          <li
                            key={`${candidate.user_id}-${index}`}
                            id={`${listboxId}-option-${index}`}
                            role="option"
                            aria-selected={index === highlighted}
                            onMouseEnter={() => setHighlighted(index)}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              void submit(candidate.email);
                            }}
                            className="flex cursor-pointer items-center gap-2 rounded-sm px-[12px] py-[8px] text-sm"
                            style={{
                              backgroundColor: index === highlighted
                                ? (isDark ? "#3a3a40" : "#f3f4f6")
                                : "transparent",
                            }}
                          >
                            <Avatar className="size-6">
                              <AvatarFallback className="text-[10px]">
                                {initialsOf(candidate.name, candidate.email)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                            <span className="shrink-0 truncate text-xs text-muted-foreground">
                              {candidate.email}
                            </span>
                          </li>
                        ))}
                      </ul>,
                      document.body,
                    )
                  )}
                </div>

                <Select
                  value={access}
                  onValueChange={(value) => setAccess(value as GrantableAccess)}
                >
                  <SelectTrigger
                    className="h-9 text-sm sm:w-44"
                    aria-label="Access level"
                    disabled={!canManageMembers || submitting}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent sideOffset={8}>
                    {ACCESS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label} — {option.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  onClick={() => void submit()}
                  disabled={
                    !canManageMembers ||
                    submitting ||
                    typedEmail.length === 0 ||
                    isDuplicate
                  }
                  className="h-9 sm:w-28"
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <UserPlus className="size-4" aria-hidden="true" />
                  )}
                  {submitting ? "Adding…" : canInviteByEmail ? "Send invite" : "Add"}
                </Button>
              </div>

              {!canManageMembers && !loading && (
                <p className="text-xs text-muted-foreground">
                  You have view-only access, so you can see this list but not change it.
                </p>
              )}

              {formError && (
                <p role="alert" className="text-xs text-destructive">
                  {formError}
                </p>
              )}
            </div>

            {/* ── Current members ─────────────────────────── */}
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Current members
              </h3>

              {loading && (
                <div className="space-y-1">
                  <MemberSkeleton />
                  <MemberSkeleton />
                </div>
              )}

              {!loading && loadError && (
                <p role="alert" className="py-2 text-sm text-destructive">
                  {loadError}
                </p>
              )}

              {!loading && !loadError && members.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">
                  No members yet. Add someone to share this {isBoard ? "board" : "workspace"}.
                </p>
              )}

              {!loading &&
                members.map((member) => (
                  <div
                    key={member.user_id}
                    className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-accent/40"
                  >
                    <Avatar className="size-8">
                      {member.avatar_url && <AvatarImage src={member.avatar_url} alt="" />}
                      <AvatarFallback className="text-[11px]">
                        {initialsOf(member.name, member.email)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{member.name}</span>
                        {member.role === "owner" && (
                          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                            Owner
                          </Badge>
                        )}
                        {canManageMembers && isOnline(member.last_active_at) && (
                          <span
                            className="size-2 shrink-0 rounded-full bg-green-500"
                            aria-label="Online"
                          />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="truncate text-xs text-muted-foreground">
                          {member.email}
                        </span>
                        {isBoard && member.inherited && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Check
                              className="size-3 text-muted-foreground/60"
                              aria-hidden="true"
                            />
                            Inherited from workspace
                          </span>
                        )}
                        {isBoard && !member.inherited && (
                          <span className="text-[11px] text-muted-foreground">
                            Set for this board only
                          </span>
                        )}
                        {canManageMembers && (
                          <span
                            className={
                              "text-[11px] " + (member.status === "pending" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")
                            }
                          >
                            {member.status === "pending" ? "Pending" : "Active"}
                          </span>
                        )}
                        {canManageMembers && member.last_active_at && (
                          <RelativeWithExact iso={member.last_active_at}>
                            {(relative) => (
                              <span>Last active {relative}</span>
                            )}
                          </RelativeWithExact>
                        )}
                      </div>
                    </div>

                    {member.role === "owner" ? (
                      <span className="shrink-0 text-xs text-muted-foreground">Owner</span>
                    ) : canManageMembers ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-28 shrink-0 justify-between"
                            disabled={busyUserId === member.user_id}
                            aria-label={`Access for ${member.name}`}
                          >
                            {accessRoleLabel(member.role)}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                            Access
                          </DropdownMenuLabel>
                          {ACCESS_OPTIONS.map((option) => (
                            <DropdownMenuItem
                              key={option.value}
                              onSelect={() => void handleChangeAccess(member, option.value)}
                            >
                              <span className="flex flex-col">
                                {option.label}
                                <span className="text-xs text-muted-foreground">
                                  {option.description}
                                </span>
                              </span>
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          {isBoard && !member.inherited && (
                            <>
                              <DropdownMenuItem onSelect={() => setPendingAction({ kind: "clear", member })}>
                                Use workspace access
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setPendingAction({ kind: "remove", member })}
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {accessRoleLabel(member.role)}
                      </span>
                    )}
                    {canManageMembers && (
                      <div className="hidden shrink-0 flex-col items-end gap-0.5 text-right text-[11px] text-muted-foreground md:flex">
                        {member.last_login_at && (
                          <RelativeWithExact iso={member.last_login_at}>
                            {(relative) => (
                              <span>Login {relative}</span>
                            )}
                          </RelativeWithExact>
                        )}
                        {member.joined_at && (
                          <RelativeWithExact iso={member.joined_at}>
                            {(relative) => (
                              <span>Joined {relative}</span>
                            )}
                          </RelativeWithExact>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>

            {/* ── Pending invites ─────────────────────────── */}
            {pendingInvites.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pending invites
                </h3>
                {pendingInvites.map((invite) => (
                  <div
                    key={invite.code}
                    className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-accent/40"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{invite.email}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        Invited as {accessRoleLabel(invite.role)} · waiting to join
                      </span>
                    </div>

                    {canManageMembers ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={busyUserId === invite.code}
                          onClick={() => void handleResend(invite)}
                        >
                          {busyUserId === invite.code ? "Sending…" : "Resend"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={busyUserId === invite.code}
                          onClick={() => setPendingAction({ kind: "cancel", invite })}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {accessRoleLabel(invite.role)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(next) => {
          if (!next) setPendingAction(null);
        }}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirm}
        variant="destructive"
        onConfirm={() => void confirmPending()}
        loading={working}
      />
    </>
  );
}

/**
 * A member counts as online while their last heartbeat is inside the online
 * window. Null means never seen, which is not the same as offline-recently and
 * is rendered without a dot.
 */
function isOnline(lastActiveAt: string | null): boolean {
  if (!lastActiveAt) return false;
  const date = new Date(lastActiveAt);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() < ONLINE_WINDOW_MS;
}

/** Relative time, e.g. "about 2 hours ago". */
function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

/** Compact absolute stamp, e.g. "5 Oct 14:32". */
function formatShort(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "d MMM HH:mm");
}

/** Relative time wrapped with an exact timestamp tooltip. */
function RelativeWithExact({
  iso,
  children,
}: {
  iso: string | null;
  children: (relative: string) => React.ReactNode;
}) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const relative = relativeTime(iso);
  const exact = format(date, "d MMM yyyy 'at' HH:mm zzz");

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children(relative)}</TooltipTrigger>
      <TooltipContent>{exact}</TooltipContent>
    </Tooltip>
  );
}

export type { MembersAccessModalProps };