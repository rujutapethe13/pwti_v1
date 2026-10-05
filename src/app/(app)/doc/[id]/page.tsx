"use client";

import { useParams } from "next/navigation";

export default function DocPage() {
  const params = useParams();
  const docId = params.id as string;

  return (
    <main className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-bold">New Document</h1>
        <p className="mt-1 text-sm text-muted-foreground">Document ID: {docId}</p>
        <div className="mt-8 rounded-lg border border-dashed py-20 text-center">
          <p className="text-sm text-muted-foreground">Rich text editor coming soon.</p>
        </div>
      </div>
    </main>
  );
}
