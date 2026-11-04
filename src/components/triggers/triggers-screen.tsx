"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Edit2, Copy, Mail, MailOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { runTrigger } from "@/features/triggers/engine";
import { TriggerEditor } from "./trigger-editor";
import type { Trigger } from "@/features/triggers/types";

interface TriggersScreenProps {
  triggers: Trigger[];
  boards: Array<{ id: string; name: string }>;
  onRefresh: () => void;
}

function conditionSummary(t: Trigger): string {
  const collect = (g: any, parts: string[]): void => {
    if (!g || !Array.isArray(g.conditions)) return;
    g.conditions.forEach((c: any, i: number) => {
      if (c.logic) {
        if (i > 0) parts.push(` ${c.logic} `);
        collect(c, parts);
      } else {
        if (i > 0) parts.push(` ${g.logic || "AND"} `);
        parts.push(`${c.columnName || c.columnId} ${c.operator.replace("_", " ")} "${c.value}"`);
      }
    });
  };
  const parts: string[] = [];
  collect(t.conditions, parts);
  return parts.length ? parts.join("") : "Any item";
}

function runModeLabel(t: Trigger): string {
  return t.runMode === "manual" ? "Manual" : t.runMode === "automatic" ? "Automatic" : "Manual + Auto";
}

export function TriggersScreen({ triggers, boards, onRefresh }: TriggersScreenProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Trigger | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleCreate = () => setEditing(null);
  const handleEdit = (t: Trigger) => setEditing(t);
  const handleDuplicate = (t: Trigger) => setEditing({ ...t, id: `copy-${Date.now()}`, name: `${t.name} (Copy)`, lastRunAt: undefined });

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/triggers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error("toggle failed");
      onRefresh();
      toast.success(`Trigger turned ${enabled ? "ON" : "OFF"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle trigger");
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/triggers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      onRefresh();
      toast.success("Trigger deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete trigger");
    } finally {
      setDeleting(null);
    }
  };

  const handleRun = async (t: Trigger) => {
    try {
      const result = await runTrigger(t.id, { manual: true, force: true, startedBy: "manual" });
      if (result.matched === 0) {
        toast.info("No matching items, nothing sent", { description: result.error || t.name });
      } else {
        const failed = result.failed > 0 ? ` (${result.failed} failed)` : "";
        toast.success(`Email sent for ${result.sent} of ${result.matched} items${failed}`, { description: t.name });
      }
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Trigger run failed");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Triggers</h1>
            <p className="text-sm text-muted-foreground">
              Reusable triggers that optionally send emails. Manual triggers also appear as
              buttons on their board toolbars.
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 size-4" />
            New trigger
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All triggers</CardTitle>
            <CardDescription>
              {triggers.length} trigger{triggers.length !== 1 ? "s" : ""}
              across your boards. Scope, conditions, and email settings are configured per trigger.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left pb-3 pr-4">Name</th>
                    <th className="text-left pb-3 pr-4">Condition</th>
                    <th className="text-left pb-3 pr-4">Run mode</th>
                    <th className="text-left pb-3 pr-4">Scope</th>
                    <th className="text-left pb-3 pr-4">Email</th>
                    <th className="text-left pb-3">Enabled</th>
                    <th className="text-right pb-3 pr-2">Last run</th>
                    <th className="text-right pb-2 pr-2">Run</th>
                    <th className="text-right pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {triggers.map((t) => (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                      <td className="py-4 pr-4">
                        <div className="font-medium">{t.name}</div>
                        {t.description && <div className="text-[11px] text-muted-foreground">{t.description}</div>}
                      </td>
                      <td className="py-4 pr-4 text-[12px] text-muted-foreground">{conditionSummary(t)}</td>
                      <td className="py-4 pr-4">
                        <Badge variant={t.runMode === "automatic" ? "secondary" : "outline"}>
                          {runModeLabel(t)}
                        </Badge>
                      </td>
                      <td className="py-4 pr-4 text-[12px] text-muted-foreground">
                        {t.scopeMode === "all" ? "All boards" : t.scopeBoards.length === 0 ? "No boards" : `${t.scopeBoards.length} board${t.scopeBoards.length !== 1 ? "s" : ""} selected`}
                      </td>
                      <td className="py-4 pr-4">
                        <Badge variant={t.emailSettings.enabled ? "default" : "outline"}>
                          {t.emailSettings.enabled ? <><Mail className="mr-1 size-3" /> On</> : <><MailOpen className="mr-1 size-3" /> Off</>}
                        </Badge>
                      </td>
                      <td className="py-4 pr-4">
                        <Switch
                          checked={t.enabled}
                          onCheckedChange={(enabled) => handleToggle(t.id, enabled)}
                          disabled={deleting === t.id}
                        />
                      </td>
                      <td className="py-4 pr-2 text-right">
                        <div className="text-[11px] text-muted-foreground">
                          {t.lastRunAt ? new Date(t.lastRunAt).toLocaleString() : "—"}
                        </div>
                      </td>
                      <td className="py-2 pr-2 text-right">
                        {(t.runMode === "manual" || t.runMode === "both") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRun(t)}
                            disabled={deleting === t.id}
                            className="text-[11px] h-6 border-transparent hover:border-transparent"
                          >
                            Run
                          </Button>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEdit(t)}
                            disabled={deleting === t.id}
                          >
                            <Edit2 className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDuplicate(t)}
                            disabled={deleting === t.id}
                          >
                            <Copy2 className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            onClick={() => handleDelete(t.id)}
                            disabled={deleting === t.id}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {triggers.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-muted-foreground">
                        No triggers yet. Create your first trigger below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit trigger" : "New trigger"}</DialogTitle>
              <DialogDescription>
                Configure who the trigger applies to, when it runs, and whether it sends an email.
              </DialogDescription>
            </DialogHeader>
            <TriggerEditor
              trigger={editing}
              boards={boards}
              onSave={async (t) => {
                try {
                  if (editing) {
                    const res = await fetch("/api/triggers", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: editing.id, ...t }),
                    });
                    if (!res.ok) throw new Error("update failed");
                  } else {
                    const res = await fetch("/api/triggers", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(t),
                    });
                    if (!res.ok) throw new Error("create failed");
                  }
                  setEditing(null);
                  onRefresh();
                  toast.success(`Trigger "${t.name}" saved`);
                } catch (err: any) {
                  toast.error(err.message || "Failed to save trigger");
                }
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
