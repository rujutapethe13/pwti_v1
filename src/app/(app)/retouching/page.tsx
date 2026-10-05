import { EngineBoardPage } from "@/components/shared/engine-board-page";
import { loadBoardPageData } from "@/features/boards/engine/data";

export default async function RetouchingPage() {
  const data = await loadBoardPageData("retouching");

  if (!data) {
    throw new Error("Retouching board data is missing.");
  }

  return <EngineBoardPage data={data} />;
}

