import { EngineBoardPage } from "@/components/shared/engine-board-page";
import { loadBoardPageData } from "@/features/boards/engine/data";

export default async function ProductionPage() {
  const data = await loadBoardPageData("production");

  if (!data) {
    throw new Error("Production board data is missing.");
  }

  return <EngineBoardPage data={data} />;
}
