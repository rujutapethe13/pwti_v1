import { createServiceClient } from "@/lib/supabase/server";
import { listTriggers } from "@/features/triggers/storage";
import { TriggersScreen } from "@/components/triggers/triggers-screen";

export const dynamic = "force-dynamic";

export default async function TriggersPage() {
  const supabase = await createServiceClient();
  const [triggers, boards] = await Promise.all([
    listTriggers(),
    supabase.from("boards").select("id, name").order("name"),
  ]);

  return (
    <TriggersScreen
      triggers={triggers}
      boards={(boards.data || []) as Array<{ id: string; name: string }>}
      onRefresh={() => {
        // Page is stateless; the client refetches via its own effect.
      }}
    />
  );
}
