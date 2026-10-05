"use client";

import { useParams } from "next/navigation";
import { ArrowLeft, FileCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWorkspace } from "@/lib/workspace-context";

export default function FormPage() {
  const params = useParams();
  const formId = params.id as string;
  const { activeWorkspace } = useWorkspace();
  const form = activeWorkspace?.content.find((item) => item.id === formId && item.type === "form");

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="size-8">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{form?.name ?? "Form"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {form?.boardId ? `Linked to board ${form.boardId}` : "Form builder coming soon."}
            </p>
          </div>
        </div>

        <Card className="p-8">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileCog className="size-10 text-muted-foreground mb-4" />
            <p className="text-sm font-medium">Form builder</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The form builder interface will be available here. You&apos;ll be able to add fields, configure validation, and publish your form.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
