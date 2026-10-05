"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Plus, X, ArrowLeft } from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

const AVAILABLE_TOOLS = [
  "Web Search",
  "Code Interpreter",
  "File Manager",
  "Database Query",
  "Email",
  "Calendar",
  "Slack",
  "GitHub",
];

export default function NewAgentPage() {
  const router = useRouter();
  const { activeWorkspaceId, addAgent } = useWorkspace();
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const toggleTool = (tool: string) => {
    setSelectedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Please enter an agent name.");
      return;
    }
    if (!activeWorkspaceId) {
      toast.error("No workspace selected.");
      return;
    }
    setIsCreating(true);
    try {
      const agent = addAgent({
        name: name.trim(),
        instructions: instructions.trim(),
        tools: selectedTools,
      });
      toast.success("Agent created successfully.");
      router.push("/agents");
    } catch {
      toast.error("Failed to create agent.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="size-8"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create new agent</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure an AI assistant to help automate tasks in your workspace.
            </p>
          </div>
        </div>

        <Card className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Content Reviewer"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Instructions / Prompt</label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Describe what this agent should do, how it should behave, and any constraints..."
              rows={6}
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">Tools</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TOOLS.map((tool) => {
                const isActive = selectedTools.includes(tool);
                return (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => toggleTool(tool)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                      isActive
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50 hover:bg-accent",
                    )}
                  >
                    {isActive && <X className="size-3" />}
                    {tool}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => router.back()} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating || !name.trim()}>
              {isCreating ? "Creating..." : "Create agent"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}
