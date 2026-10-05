import { EngineBoardPage } from "@/components/shared/engine-board-page";
import { loadBoardPageData } from "@/features/boards/engine/data";

export default async function SettingsPage() {
  const data = await loadBoardPageData("settings");

  if (!data) {
    throw new Error("Settings board data is missing.");
  }

  return <EngineBoardPage data={data} />;
}

