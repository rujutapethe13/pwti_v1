"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Plus } from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AgentsPage() {
  const router = useRouter();
  const { activeWorkspace } = useWorkspace();
  const agents = activeWorkspace?.agents ?? [];

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="size-8">
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Agents</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage your AI assistants.
              </p>
            </div>
          </div>
          <Button onClick={() => router.push("/agents/new")}>
            <Plus className="size-4 mr-2" />
            New agent
          </Button>
        </div>

        {agents.length === 0 ? (
          <Card className="p-8">
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Bot className="size-10 text-muted-foreground mb-4" />
              <p className="text-sm font-medium">No agents yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create your first agent to automate tasks and workflows.
              </p>
              <Button className="mt-4" onClick={() => router.push("/agents/new")}>
                <Plus className="size-4 mr-2" />
                Create agent
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <Card
                key={agent.id}
                className="p-4 hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => router.push(`/agents/${agent.id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                    <Bot className="size-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{agent.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {agent.tools.length} tool{agent.tools.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                  {agent.instructions || "No instructions provided."}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
