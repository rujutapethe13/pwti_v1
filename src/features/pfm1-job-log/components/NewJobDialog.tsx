"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JobLogRow, JobStatus } from "../types";
import { STATUS_OPTIONS } from "../lib/colors";

interface NewJobDialogProps {
  open: boolean;
  onClose: () => void;
  onAddJob: (row: Omit<JobLogRow, "id" | "updatedAt">) => void;
}

const initialForm = {
  client: "",
  jobType: "",
  batch: "",
  received: "",
  uploaded: "",
  skus: 0,
  comment: "",
  status: "Pending" as JobStatus,
};

export function NewJobDialog({ open, onClose, onAddJob }: NewJobDialogProps) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: keyof typeof initialForm, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.client.trim()) newErrors.client = "Required";
    if (!form.jobType.trim()) newErrors.jobType = "Required";
    if (!form.batch.trim()) newErrors.batch = "Required";
    if (!form.received) newErrors.received = "Required";
    if (form.skus < 0) newErrors.skus = "Must be ≥ 0";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onAddJob({
      client: form.client.trim(),
      jobType: form.jobType.trim(),
      batch: form.batch.trim(),
      received: form.received,
      uploaded: form.uploaded || null,
      skus: form.skus,
      comment: form.comment.trim(),
      status: form.status,
    });
    setForm(initialForm);
  };

  const handleReset = () => {
    setForm(initialForm);
    setErrors({});
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      aria-hidden="true"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border bg-card p-6 shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
        aria-label="Add new job"
      >
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">New Job</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm text-muted-foreground opacity-70 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Client</label>
              <input
                type="text"
                value={form.client}
                onChange={(e) => handleChange("client", e.target.value)}
                className={cn(
                  "mt-0.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring",
                  errors.client && "border-destructive",
                )}
                placeholder="Acme Pictures"
              />
              {errors.client && <p className="mt-0.5 text-xs text-destructive">{errors.client}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Job Type</label>
              <input
                type="text"
                value={form.jobType}
                onChange={(e) => handleChange("jobType", e.target.value)}
                className={cn(
                  "mt-0.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring",
                  errors.jobType && "border-destructive",
                )}
                placeholder="Color Grading"
              />
              {errors.jobType && <p className="mt-0.5 text-xs text-destructive">{errors.jobType}</p>}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Batch</label>
            <input
              type="text"
              value={form.batch}
              onChange={(e) => handleChange("batch", e.target.value)}
              className={cn(
                "mt-0.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring",
                errors.batch && "border-destructive",
              )}
              placeholder="PF-BATCH-2026-Q3-01"
            />
            {errors.batch && <p className="mt-0.5 text-xs text-destructive">{errors.batch}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Received</label>
              <input
                type="date"
                value={form.received}
                onChange={(e) => handleChange("received", e.target.value)}
                className={cn(
                  "mt-0.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring",
                  errors.received && "border-destructive",
                )}
              />
              {errors.received && <p className="mt-0.5 text-xs text-destructive">{errors.received}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Uploaded</label>
              <input
                type="date"
                value={form.uploaded}
                onChange={(e) => handleChange("uploaded", e.target.value)}
                className="mt-0.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">SKUs</label>
            <input
              type="number"
              min={0}
              value={form.skus}
              onChange={(e) => handleChange("skus", Number(e.target.value))}
              className={cn(
                "mt-0.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring",
                errors.skus && "border-destructive",
              )}
              placeholder="0"
            />
            {errors.skus && <p className="mt-0.5 text-xs text-destructive">{errors.skus}</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={form.status}
              onChange={(e) => handleChange("status", e.target.value as JobStatus)}
              className="mt-0.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Comment</label>
            <textarea
              value={form.comment}
              onChange={(e) => handleChange("comment", e.target.value)}
              className="mt-0.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="Delivery notes..."
              rows={2}
            />
          </div>
        </div>

        <footer className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={handleReset}>
            Clear
          </Button>
          <Button
            size="sm"
            type="submit"
            className="text-sm font-medium"
            style={{
              backgroundColor: "hsl(var(--soft-amber-bg))",
              color: "hsl(var(--soft-amber-text))",
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add job
          </Button>
        </footer>
      </form>
    </div>
  );
}
