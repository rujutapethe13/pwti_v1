"use client";

import { useEffect, useState } from "react";
import { Mail, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { runTrigger } from "@/features/triggers/engine";
import type { Trigger } from "@/features/triggers/types";

interface ManualTriggerButtonsProps {
  boardId: string;
}

export function ManualTriggerButtons({ boardId }: ManualTriggerButtonsProps) {
  const [triggers, setTriggers] = useState<Trigger[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/triggers")
      .then((r) => r.json())
      .then((json: any) => {
        if (!cancelled && Array.isArray(json.triggers)) {
          setTriggers(json.triggers);
        }
      })
      .catch(() => {
        // Triggers are optional; a board must never fail to load because of them.
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const manual = triggers.filter(
    (t) =>
      t.enabled &&
      (t.runMode === "manual" || t.runMode === "both") &&
      (t.scopeMode === "all" || t.scopeBoards.includes(boardId))
  );

  if (manual.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-px bg-border" />
      {manual.map((t) => (
        <Button
          key={t.id}
          size="sm"
          variant="outline"
          onClick={() => handleRun(t)}
          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 hover:text-emerald-900 font-semibold gap-1.5 text-xs"
        >
          <Mail className="size-3.5" />
          {t.name}
        </Button>
      ))}
    </div>
  );

  async function handleRun(t: Trigger) {
    const btn = document.activeElement;
    try {
      const result = await runTrigger(t.id, { manual: true, force: true, startedBy: "manual" });
      if (result.matched === 0) {
        toast.info("No matching items, nothing sent", { description: result.error || t.name });
      } else {
        const failed = result.failed > 0 ? ` (${result.failed} failed)` : "";
        toast.success(`Email sent for ${result.sent} of ${result.matched} items${failed}`, { description: t.name });
      }
    } catch (err: any) {
      toast.error(err.message || "Trigger run failed");
    }
  }
}
