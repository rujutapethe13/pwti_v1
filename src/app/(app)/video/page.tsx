import { EngineBoardPage } from "@/components/shared/engine-board-page";
import { loadBoardPageData } from "@/features/boards/engine/data";

export default async function VideoPage() {
  const data = await loadBoardPageData("video");

  if (!data) {
    throw new Error("Video board data is missing.");
  }

  return <EngineBoardPage data={data} />;
}

