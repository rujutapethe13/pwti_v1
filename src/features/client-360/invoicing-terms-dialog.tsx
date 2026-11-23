"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setClientPaymentTermAction } from "./actions/payment-term-action";
import {
  applyPaymentDaysToPendingJobsAction,
  getClientPendingBoardsAction,
  undoPaymentDaysToPendingJobsAction,
} from "./actions/job-payment-term-action";
import type { JobsDrawerBoard } from "./card-data";

type TermChoice = "immediate" | "net7" | "net15" | "net30" | "net45" | "net60" | "custom" | "not-added";

function choiceForDays(days: number | null | undefined): TermChoice {
  if (days == null) return "not-added";
  if (days === 0) return "immediate";
  if (days === 7) return "net7";
  if (days === 15) return "net15";
  if (days === 30) return "net30";
  if (days === 45) return "net45";
  if (days === 60) return "net60";
  return "custom";
}

function daysForChoice(choice: TermChoice, customDays: number): number | null {
  switch (choice) {
    case "immediate":
      return 0;
    case "net7":
      return 7;
    case "net15":
      return 15;
    case "net30":
      return 30;
    case "net45":
      return 45;
    case "net60":
      return 60;
    case "custom":
      return customDays;
    default:
      return null;
  }
}

export interface InvoicingTermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  paymentTermDays: number | null;
  onSaved: (days: number | null) => void;
}

export function InvoicingTermsDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  paymentTermDays,
  onSaved,
}: InvoicingTermsDialogProps) {
  const [step, setStep] = React.useState<"term" | "apply">("term");
  const [choice, setChoice] = React.useState<TermChoice>(choiceForDays(paymentTermDays));
  const [customDays, setCustomDays] = React.useState(
    String(paymentTermDays && paymentTermDays > 0 ? paymentTermDays : 21),
  );
  const [saving, setSaving] = React.useState(false);
  const [boards, setBoards] = React.useState<JobsDrawerBoard[]>([]);
  const [totalPending, setTotalPending] = React.useState(0);
  const [boardsLoading, setBoardsLoading] = React.useState(false);
  const [selectedBoards, setSelectedBoards] = React.useState<Set<string>>(new Set());
  const [confirming, setConfirming] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [savedDays, setSavedDays] = React.useState<number | null>(paymentTermDays);

  const wasOpen = React.useRef(false);

  React.useEffect(() => {
    if (open && !wasOpen.current) {
      setStep("term");
      setChoice(choiceForDays(paymentTermDays));
      setCustomDays(String(paymentTermDays && paymentTermDays > 0 ? paymentTermDays : 21));
      setSavedDays(paymentTermDays);
      setBoards([]);
      setTotalPending(0);
      setSelectedBoards(new Set());
      setConfirming(false);
    }
    wasOpen.current = open;
  }, [open, paymentTermDays]);

  const customValue = Math.floor(Number(customDays));
  const customValid = Number.isFinite(customValue) && customValue >= 1;
  const selectedPending = boards
    .filter((board) => selectedBoards.has(board.boardId))
    .reduce((sum, board) => sum + board.pendingCount, 0);
  const selectedBoardCount = selectedBoards.size;

  const handleSave = async () => {
    if (choice === "custom" && !customValid) {
      toast.error("Enter a whole number of days (min 1).");
      return;
    }
    const days = daysForChoice(choice, customValue);
    setSaving(true);
    const result = await setClientPaymentTermAction({ clientId, paymentTermDays: days });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not save payment terms.");
      return;
    }
    setSavedDays(days);
    onSaved(days);
    toast.success(
      days == null
        ? "Payment terms cleared."
        : `Payment terms saved: ${days === 0 ? "same day" : `${days} days`}.`,
    );

    setStep("apply");
    setBoardsLoading(true);
    const pending = await getClientPendingBoardsAction(clientId);
    setBoardsLoading(false);
    if (!pending.ok) {
      toast.error(pending.error ?? "Could not load pending jobs.");
      setBoards([]);
      setTotalPending(0);
      return;
    }
    setBoards(pending.boards);
    setTotalPending(pending.totalPending);
    setSelectedBoards(new Set(pending.boards.map((board) => board.boardId)));
  };

  const handleApply = async () => {
    if (savedDays == null) {
      onOpenChange(false);
      return;
    }
    if (selectedBoards.size === 0) {
      toast.error("Select at least one board, or choose Skip.");
      return;
    }
    setApplying(true);
    const result = await applyPaymentDaysToPendingJobsAction({
      clientId,
      boardIds: [...selectedBoards],
      days: savedDays,
    });
    setApplying(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not apply payment terms.");
      return;
    }
    toast.success(
      `Applied ${savedDays} days to ${result.updated} pending job${result.updated === 1 ? "" : "s"}.`,
      result.undo?.length
        ? {
            action: {
              label: "Undo",
              onClick: async () => {
                const undo = await undoPaymentDaysToPendingJobsAction({ records: result.undo ?? [] });
                if (undo.ok) toast.success(`Undid payment terms for ${undo.updated} job${undo.updated === 1 ? "" : "s"}.`);
                else toast.error(undo.error ?? "Could not undo payment terms.");
              },
            },
          }
        : undefined,
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invoicing Terms</DialogTitle>
          <DialogDescription>
            {step === "term"
              ? `Set the default payment term for ${clientName}.`
              : `Apply ${savedDays ?? 0} days to pending jobs for ${clientName}?`}
          </DialogDescription>
        </DialogHeader>

        {step === "term" ? (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {(
                [
                  { key: "immediate", label: "Immediate" },
                  { key: "net7", label: "Net 7" },
                  { key: "net15", label: "Net 15" },
                  { key: "net30", label: "Net 30" },
                  { key: "net45", label: "Net 45" },
                  { key: "net60", label: "Net 60" },
                  { key: "custom", label: "Custom" },
                  { key: "not-added", label: "Not added" },
                ] as Array<{ key: TermChoice; label: string }>
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setChoice(option.key)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    choice === option.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-accent/40"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {choice === "custom" && (
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="custom-days">
                  Custom payment days
                </label>
                <Input
                  id="custom-days"
                  type="number"
                  min={1}
                  step={1}
                  value={customDays}
                  onChange={(event) => setCustomDays(event.target.value)}
                  className="mt-1 h-8 w-32 text-xs"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Whole days, minimum 1. Shown on the card as “Custom · {customValid ? customValue : "…"} days”.
                </p>
              </div>
            )}

            <DialogFooter className="pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Apply to pending jobs?</p>
              {totalPending > 0 && (
                <button
                  type="button"
                  className="text-[11px] font-medium text-primary hover:underline"
                  onClick={() =>
                    setSelectedBoards(
                      selectedBoards.size === boards.length
                        ? new Set()
                        : new Set(boards.map((board) => board.boardId)),
                    )
                  }
                >
                  {selectedBoards.size === boards.length ? "Clear all" : "Select all"}
                </button>
              )}
            </div>

            {boardsLoading ? (
              <div className="space-y-2">
                <div className="h-8 w-full animate-pulse rounded bg-muted" />
                <div className="h-8 w-full animate-pulse rounded bg-muted" />
              </div>
            ) : boards.length === 0 ? (
              <div className="rounded-md border border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                No pending jobs for this client. The saved term applies to new jobs.
              </div>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
                {boards.map((board) => (
                  <label
                    key={board.boardId}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/30"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedBoards.has(board.boardId)}
                        onChange={(event) => {
                          setSelectedBoards((prev) => {
                            const next = new Set(prev);
                            if (event.target.checked) next.add(board.boardId);
                            else next.delete(board.boardId);
                            return next;
                          });
                          setConfirming(false);
                        }}
                        className="rounded border-border"
                      />
                      <span className="font-medium text-foreground">{board.boardName}</span>
                    </span>
                    <span className="text-muted-foreground">
                      {board.pendingCount} pending
                    </span>
                  </label>
                ))}
              </div>
            )}

            {confirming ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
                <p className="font-semibold">
                  Apply {savedDays ?? 0} days to {selectedPending} pending job
                  {selectedPending === 1 ? "" : "s"} on {selectedBoardCount} board
                  {selectedBoardCount === 1 ? "" : "s"}?
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Invoiced and paid jobs are unaffected.
                </p>
              </div>
            ) : null}

            <DialogFooter className="pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={applying}
              >
                Skip
              </Button>
              {confirming ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirming(false)}
                    disabled={applying}
                  >
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={handleApply} disabled={applying}>
                    {applying ? "Applying…" : "Confirm apply"}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setConfirming(true)}
                  disabled={savedDays == null || selectedBoards.size === 0 || totalPending === 0}
                >
                  Apply
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
