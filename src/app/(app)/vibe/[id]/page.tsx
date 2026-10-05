"use client";

import { useParams } from "next/navigation";
import { ArrowLeft, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWorkspace } from "@/lib/workspace-context";

export default function VibeAppPage() {
  const params = useParams();
  const vibeId = params.id as string;
  const { activeWorkspace } = useWorkspace();
  const vibeApp = activeWorkspace?.content.find((item) => item.id === vibeId && item.type === "vibe-app");

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="size-8">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{vibeApp?.name ?? "Vibe app"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {vibeApp?.description || "Vibe app workspace"}
              </p>
            </div>
          </div>
        </div>

        <Card className="p-8">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Zap className="size-10 text-muted-foreground mb-4" />
            <p className="text-sm font-medium">Vibe app workspace</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This is your Vibe app. Start building by adding components, pages, and logic.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
