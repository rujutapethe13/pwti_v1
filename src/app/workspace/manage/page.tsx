import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ManageWorkspaceTable } from "@/features/workspace/manage-workspace-table";

export default async function ManageWorkspacePage() {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Manage workspace</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure boards, columns, and workspace settings.
        </p>
      </div>
      <ManageWorkspaceTable />
    </div>
  );
}