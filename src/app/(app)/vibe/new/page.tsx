"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Zap } from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

export default function NewVibeAppPage() {
  const router = useRouter();
  const { activeWorkspaceId, addVibeApp } = useWorkspace();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Please enter a Vibe app name.");
      return;
    }
    if (!activeWorkspaceId) {
      toast.error("No workspace selected.");
      return;
    }
    setIsCreating(true);
    try {
      const vibeApp = addVibeApp(name.trim(), description.trim());
      toast.success("Vibe app created successfully.");
      router.push(`/vibe/${vibeApp.id}`);
    } catch {
      toast.error("Failed to create Vibe app.");
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
            <h1 className="text-2xl font-bold">Create new Vibe app</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Set up a new Vibe app to build and ship quickly.
            </p>
          </div>
        </div>

        <Card className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Client Portal"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this Vibe app do?"
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => router.back()} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating || !name.trim()}>
              {isCreating ? "Creating..." : "Create Vibe app"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
