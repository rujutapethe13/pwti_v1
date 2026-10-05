"use client";

import { useParams } from "next/navigation";

export default function FolderPage() {
  const params = useParams();
  const folderId = params.id as string;

  return (
    <main className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-bold">Folder</h1>
        <p className="mt-1 text-sm text-muted-foreground">Folder ID: {folderId}</p>
        <div className="mt-8 rounded-lg border border-dashed py-20 text-center">
          <p className="text-sm text-muted-foreground">Folder content will appear here.</p>
        </div>
      </div>
    </main>
  );
}
