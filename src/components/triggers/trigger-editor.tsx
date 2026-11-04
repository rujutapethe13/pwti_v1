"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mail, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { Trigger } from "@/features/triggers/types";

const COMMON_COLUMNS = [
  "Status",
  "Payment Status",
  "Due Date",
  "Amount",
  "Client",
  "Batch",
  "Board Name",
  "Priority",
];

const OPERATORS: Array<{ value: string; label: string }> = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
  { value: "is_before", label: "is before" },
  { value: "is_after", label: "is after" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
];

const RUN_MODES: Array<{ value: string; label: string }> = [
  { value: "manual", label: "Manual (button on board toolbar)" },
  { value: "automatic", label: "Automatic (schedule / on change)" },
  { value: "both", label: "Both" },
];

interface TriggerEditorProps {
  trigger: Trigger | null;
  boards: Array<{ id: string; name: string }>;
  onSave: (values: any) => void;
  onClose?: () => void;
}

export function TriggerEditor({ trigger, boards, onSave, onClose }: TriggerEditorProps) {
  const initial = useMemo(() => {
    const email = trigger?.emailSettings || {
      enabled: false,
      toType: "static",
      to: [],
      toField: "",
      cc: [],
      subject: "",
      body: "",
      format: "per_item",
      frequencyHours: 24,
    };
    return {
      name: trigger?.name || "",
      description: trigger?.description || "",
      scopeMode: trigger?.scopeMode || "selected",
      scopeBoards: trigger?.scopeBoards || [],
      runMode: trigger?.runMode || "manual",
      conditions: trigger?.conditions?.conditions || [],
      conditionLogic: trigger?.conditions?.logic || "AND",
      actions: [
        {
          id: "act-email",
          type: "send_email",
          enabled: !!email.enabled,
          label: "Send email",
          config: {
            toType: email.toType,
            to: email.to,
            toField: email.toField,
            cc: email.cc,
            subject: email.subject,
            body: email.body,
            format: email.format,
            frequencyHours: email.frequencyHours,
          },
        },
      ],
    };
  }, [trigger]);

  const [form, setForm] = useState(initial);
  const [emailOpen, setEmailOpen] = useState(!!form.actions[0]?.enabled);
  const [testSending, setTestSending] = useState(false);

  const emailAction = form.actions?.[0];

  const addCondition = () => {
    setForm((prev) => ({
      ...prev,
      conditions: [
        ...prev.conditions,
        { id: `c-${Date.now()}`, columnName: "Status", operator: "equals", value: "Done" },
      ],
    }));
  };

  const removeCondition = (id: string) => {
    setForm((prev) => ({ ...prev, conditions: prev.conditions.filter((c) => c.id !== id) }));
  };

  const updateCondition = (id: string, patch: any) => {
    setForm((prev) => ({
      ...prev,
      conditions: prev.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const handleTestEmail = async () => {
    const s = emailAction?.config || {};
    const subject = s.subject || "Trigger test email";
    const body = s.body || "This is a test email from your trigger system.";
    setTestSending(true);
    try {
      const res = await fetch("/api/triggers/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, html: body.replace(/\n/g, "<br>") }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Test email failed");
      toast.success("Test email sent", { description: "Sent to your NOTIFY_EMAIL" });
    } catch (err: any) {
      toast.error(err.message || "Test email failed");
    } finally {
      setTestSending(false);
    }
  };

  const handleSave = () => {
    const emailSettings = {
      enabled: emailOpen && !!emailAction,
      toType: (emailAction?.config?.toType || "static") as "static" | "field",
      to: Array.isArray(emailAction?.config?.to) ? emailAction.config.to : [],
      toField: emailAction?.config?.toField || "",
      cc: Array.isArray(emailAction?.config?.cc) ? emailAction.config.cc : [],
      subject: emailAction?.config?.subject || "",
      body: emailAction?.config?.body || "",
      format: (emailAction?.config?.format || "per_item") as "per_item" | "summary",
      frequencyHours: Number(emailAction?.config?.frequencyHours) || 24,
    };

    onSave({
      name: form.name,
      description: form.description,
      scopeMode: form.scopeMode as "all" | "selected",
      scopeBoards: form.scopeMode === "selected" ? form.scopeBoards : [],
      runMode: form.runMode as "manual" | "automatic" | "both",
      conditions: {
        id: "root",
        logic: (form.conditionLogic || "AND") as "AND" | "OR",
        conditions: form.conditions,
      },
      actions: [
        {
          id: "act-email",
          type: "send_email",
          enabled: emailOpen,
          label: "Send email",
          config: emailSettings,
        },
      ],
      emailSettings,
    });
    onClose?.();
  };

  const placeholderHint = `Placeholders: {client}, {batch}, {status}, {due_date}, {amount}, {board}, {link}, {title}`;

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="max-w-2xl p-0">
        <DialogHeader>
          <DialogTitle>{trigger ? "Edit trigger" : "New trigger"}</DialogTitle>
          <DialogDescription>
            Name, scope, conditions, run mode, and email settings.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Trigger name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Send Overdue Alert Email"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Run mode</Label>
              <Select
                value={form.runMode}
                onValueChange={(v) => setForm({ ...form, runMode: v })}
              >
                {RUN_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {/* ── Scope ── */}
          <Card className="border p-4">
            <CardHeader>
              <CardTitle className="text-sm">Scope</CardTitle>
              <CardDescription>Which boards this trigger applies to.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <input
                  id="scope-all"
                  type="radio"
                  checked={form.scopeMode === "all"}
                  onChange={() => setForm({ ...form, scopeMode: "all" })}
                />
                <Label htmlFor="scope-all" className="cursor-pointer text-sm font-medium">
                  All boards
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="scope-selected"
                  type="radio"
                  checked={form.scopeMode === "selected"}
                  onChange={() => setForm({ ...form, scopeMode: "selected" })}
                />
                <Label htmlFor="scope-selected" className="cursor-pointer text-sm font-medium">
                  Selected boards
                </Label>
              </div>
              {form.scopeMode === "selected" && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Boards</Label>
                  <Select
                    multiple
                    value={form.scopeBoards}
                    onValueChange={(v) => setForm({ ...form, scopeBoards: Array.isArray(v) ? v : [] })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose boards…" />
                    </SelectTrigger>
                    <SelectContent>
                      {boards.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Conditions ── */}
          <Card className="border p-4">
            <CardHeader>
              <CardTitle className="text-sm">Conditions</CardTitle>
              <CardDescription>Items must match all conditions below to trigger.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium text-muted-foreground">Combine with</Label>
                <Select
                  value={form.conditionLogic}
                  onValueChange={(v) => setForm({ ...form, conditionLogic: v })}
                  className="w-48"
                >
                  <SelectItem value="AND">AND</SelectItem>
                  <SelectItem value="OR">OR</SelectItem>
                </Select>
              </div>
              <div className="space-y-2">
                {form.conditions.map((cond: any) => (
                  <div key={cond.id} className="flex gap-2 items-end">
                    <Select
                      value={cond.columnName || ""}
                      onValueChange={(v) => updateCondition(cond.id, { columnName: v })}
                      className="w-48"
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Column…" />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMON_COLUMNS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__">Custom column name…</SelectItem>
                      </SelectContent>
                    </Select>
                    {cond.columnName === "__custom__" && (
                      <Input
                        value={cond.customValue || ""}
                        onChange={(e) => updateCondition(cond.id, { columnName: e.target.value })}
                        placeholder="Column name"
                        className="w-40"
                      />
                    )}
                    <Select
                      value={cond.operator || "equals"}
                      onValueChange={(v) => updateCondition(cond.id, { operator: v })}
                      className="w-32"
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Operator…" />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={cond.value || ""}
                      onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                      placeholder="Value (try 'today' for dates)"
                      className="w-32"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => removeCondition(cond.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button type="button" size="sm" onClick={addCondition}>
                  <Plus className="mr-2 size-3.5" />
                  Add condition
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Example: "Payment Status equals Overdue" or "Due Date is before today".
              </p>
            </CardContent>
          </Card>

          {/* ── Email ── */}
          <Card className="border p-4">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm">Email action</CardTitle>
              <div className="flex items-center gap-2">
                <Label className="text-xs cursor-pointer flex items-center gap-1">
                  <input type="checkbox" checked={emailOpen} onChange={() => setEmailOpen(!emailOpen)} />
                  Send email
                </Label>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              {!emailOpen && (
                <p className="text-xs text-muted-foreground">
                  Turn this on to send an email when the trigger runs.
                </p>
              )}
              {emailOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Send to</Label>
                    <Select
                      value={emailAction?.config?.toType || "static"}
                      onValueChange={(v) => {
                        const cfg = emailAction?.config || {};
                        setForm({
                          ...form,
                          actions: form.actions.map((a) =>
                            a.id === "act-email" ? { ...a, config: { ...cfg, toType: v } } : a
                          ),
                        });
                      }}
                      className="w-48"
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Type…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="static">Static addresses</SelectItem>
                        <SelectItem value="field">Field on item (email column)</SelectItem>
                      </SelectContent>
                    </Select>
                    {emailAction?.config?.toType === "field" ? (
                      <Input
                        value={emailAction?.config?.toField || ""}
                        onChange={(e) => {
                          const cfg = emailAction?.config || {};
                          setForm({
                            ...form,
                            actions: form.actions.map((a) =>
                              a.id === "act-email" ? { ...a, config: { ...cfg, toField: e.target.value } } : a
                            ),
                          });
                        }}
                        placeholder="e.g. Client Email"
                      />
                    ) : (
                      <Textarea
                        value={emailAction?.config?.to?.join(", ") || ""}
                        onChange={(e) => {
                          const cfg = emailAction?.config || {};
                          setForm({
                            ...form,
                            actions: form.actions.map((a) =>
                              a.id === "act-email"
                                ? { ...a, config: { ...cfg, to: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } }
                                : a
                            ),
                          });
                        }}
                        placeholder="me@example.com, finance@example.com"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">CC (optional)</Label>
                    <Input
                      value={emailAction?.config?.cc?.join(", ") || ""}
                      onChange={(e) => {
                        const cfg = emailAction?.config || {};
                        setForm({
                          ...form,
                          actions: form.actions.map((a) =>
                            a.id === "act-email"
                              ? { ...a, config: { ...cfg, cc: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } }
                              : a
                            ),
                          });
                        }}
                        placeholder="manager@example.com"
                      />
                    </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-xs font-medium">Subject template</Label>
                    <Input
                      value={emailAction?.config?.subject || ""}
                      onChange={(e) => {
                        const cfg = emailAction?.config || {};
                        setForm({
                          ...form,
                          actions: form.actions.map((a) =>
                            a.id === "act-email" ? { ...a, config: { ...cfg, subject: e.target.value } } : a
                          ),
                        });
                      }}
                      placeholder="Overdue alert: {client} - {title}"
                    />
                    <p className="text-[11px] text-muted-foreground">{placeholderHint}</p>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-xs font-medium">Body template</Label>
                    <Textarea
                      value={emailAction?.config?.body || ""}
                      onChange={(e) => {
                        const cfg = emailAction?.config || {};
                        setForm({
                          ...form,
                          actions: form.actions.map((a) =>
                            a.id === "act-email" ? { ...a, config: { ...cfg, body: e.target.value } } : a
                          ),
                        });
                      }}
                      rows={6}
                      placeholder="Hi,\n{title} on {board} is {status}. Due {due_date}.\n{link}"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Format</Label>
                    <Select
                      value={emailAction?.config?.format || "per_item"}
                      onValueChange={(v) => {
                        const cfg = emailAction?.config || {};
                        setForm({
                          ...form,
                          actions: form.actions.map((a) =>
                            a.id === "act-email" ? { ...a, config: { ...cfg, format: v } } : a
                          ),
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Format…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_item">One email per item</SelectItem>
                        <SelectItem value="summary">One summary email</SelectItem>
                      </SelectContent>
                    </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Re-alert every (hours)</Label>
                      <Input
                        type="number"
                        value={String(emailAction?.config?.frequencyHours || 24)}
                        onChange={(e) => {
                          const cfg = emailAction?.config || {};
                          setForm({
                            ...form,
                            actions: form.actions.map((a) =>
                              a.id === "act-email"
                                ? { ...a, config: { ...cfg, frequencyHours: Number(e.target.value) || 24 } }
                                : a
                            ),
                          });
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground">Default 24. Manual runs force send.</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={handleTestEmail}
                    disabled={testSending}
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <Mail className="size-3.5" />
                    {testSending ? "Sending test…" : "Send test email"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => onClose?.()}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save trigger</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
