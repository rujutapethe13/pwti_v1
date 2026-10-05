import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CompiledTable } from "@/features/workspace/compiled-table";

export default async function CompiledPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight">Compiled</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aggregated view of compiled data across all boards.
        </p>
      </div>
      <CompiledTable />
    </div>
  );
}