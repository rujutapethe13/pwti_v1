"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface DailyActivityErrorBoundaryProps {
  children: React.ReactNode;
  error: Error | null;
  reset: () => void;
}

export function DailyActivityErrorBoundary({
  children,
  error,
  reset,
}: DailyActivityErrorBoundaryProps) {
  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-6 py-6 lg:px-8">
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <CardContent>
            <AlertTriangle className="mb-3 h-10 w-10 text-destructive/40" />
            <h3 className="text-base font-medium">Something went wrong loading daily activity</h3>
            <p className="text-muted-foreground mt-1 text-sm">{error.message}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                reset();
                toast.dismiss();
                window.location.reload();
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
