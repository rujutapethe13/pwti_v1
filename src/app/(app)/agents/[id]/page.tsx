"use client";

import { useParams } from "next/navigation";
import { ArrowLeft, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWorkspace } from "@/lib/workspace-context";

export default function AgentDetailPage() {
  const params = useParams();
  const agentId = params.id as string;
  const { activeWorkspace } = useWorkspace();
  const agent = activeWorkspace?.agents?.find((a) => a.id === agentId);

  if (!agent) {
    return (
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-2xl px-6 py-8">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="size-8 mb-4">
            <ArrowLeft className="size-4" />
          </Button>
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Agent not found.</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="size-8">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{agent.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Created {new Date(agent.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        <Card className="p-6 space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-1">Instructions</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {agent.instructions || "No instructions provided."}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-1">Tools</h3>
            <div className="flex flex-wrap gap-2">
              {agent.tools.map((tool) => (
                <span key={tool} className="rounded-full border px-2.5 py-0.5 text-xs">
                  {tool}
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
