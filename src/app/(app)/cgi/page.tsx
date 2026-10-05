import { EngineBoardPage } from "@/components/shared/engine-board-page";
import { loadBoardPageData } from "@/features/boards/engine/data";

export default async function CgiPage() {
  const data = await loadBoardPageData("cgi");

  if (!data) {
    throw new Error("CGI board data is missing.");
  }

  return <EngineBoardPage data={data} />;
}

